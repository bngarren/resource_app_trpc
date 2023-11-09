import { Logger, pino } from "pino";
/* eslint-disable @typescript-eslint/no-explicit-any */

/*
TODO: Add retry capability to Saga
*/

import { prefixedError } from "./prefixedError";
import { logger } from "../main";
import config from "../config";

type InvokeFnType<T> = (...args: any[]) => Promise<T>;
type CompensationFnType<T, K> = (data: T, ...args: any[]) => Promise<K>;

/**
 * ### A step (local transaction) in the Saga
 * Contains an `invokeFn` that is the foward step and a `compensationFn` that
 * is the rollback/reversal of the invokeFn.
 *
 * The generic type `T` represents the output of the `invokeFn` which is passed
 * as the first parameter of the `compensationFn`.
 */
class SagaStep<T = any, K = any> {
  private wasInvoked: boolean;
  private invokeResult: T;

  constructor(
    private name: string,
    private invokeFn: InvokeFnType<T>,
    private compensationFn: CompensationFnType<T, K>,
  ) {
    this.wasInvoked = false;
  }

  async invoke(...args: unknown[]): Promise<T> {
    this.wasInvoked = true;
    this.invokeResult = await this.invokeFn(...args);
    return this.invokeResult;
  }

  async compensate(...args: unknown[]): Promise<K> {
    if (this.wasInvoked) {
      return await this.compensationFn(this.invokeResult, ...args);
    }
    return Promise.resolve(null as K);
  }

  setInvokeFn(newInvokeFn: InvokeFnType<T>) {
    this.invokeFn = newInvokeFn;
  }

  setCompensationFn(newCompensationFn: CompensationFnType<T, K>) {
    this.compensationFn = newCompensationFn;
  }

  getName() {
    return this.name;
  }
}

/**
 * ### Helps build a Saga instance with invocations and compsenations
 * 
 * - `withLogger(verbose?)` - Will log the Saga output using our app's logger. If verbose is false (default=true),
 * will not include logging of data objects, i.e. Errors.
 * 
 * 
 * #### Example
 * ```javascript
 * const saga = new SagaBuilder()
      .invoke(testFunction1)
      .withCompensation(compensationFunction1)
      .invoke(testFunction2)
      .withCompensation(compensationFunction2)
      .invoke(testFunction3)
      .withCompensation(compensationFunction3)
      .build();

    try {
      await saga.execute();
    } catch (error) {
      // Handle error
    }
 * ```
 * #### Example with when()
 * ```javascript
 * const saga = new SagaBuilder()
      .invoke(testFunction1)
      .withCompensation(compensationFunction1)
      .when(() => false)
      .invoke(testFunction2) // Does not get added!
      .withCompensation(compensationFunction2) // Does not get added!
      .invoke(testFunction3) // Added
      .withCompensation(compensationFunction3) // Added
      .build();
 * ```
 */
export class SagaBuilder {
  private steps: SagaStep[] = [];
  private logger: Logger | undefined;
  private sagaName: string;
  private verbose: boolean;

  /**
   * Defaults to true.
   * This flag is used by the `when()` function to determine if the
   * next `invoke()` should add the step or not.
   */
  private shouldAddNextStep = true;

  /**
   * This flag tracks whether or not a previous step has been skipped due to the `when()` function.
   * If an `invoke()` was skipped, we also want to skip its associated `withCompsenation()` call.
   */
  private lastStepSkipped = false;

  constructor(name = "unnamed") {
    this.sagaName = name;
    this.verbose = true;
  }

  /**
   * The boolean result of the predicate will determine if the following invoke()/withCompensation() pair
   * is used (**true**) or skipped (**false**).
   * @param predicate A boolean or function that returns a boolean
   * @returns
   */
  when(predicate: boolean | (() => boolean)): this {
    if (typeof predicate === "function") {
      this.shouldAddNextStep = predicate();
    } else {
      this.shouldAddNextStep = predicate;
    }
    return this;
  }

  invoke<T>(invokeFn: () => Promise<T>, stepName?: string): this {
    if (this.shouldAddNextStep) {
      this.steps.push(
        new SagaStep<T>(stepName ?? "", invokeFn, () => Promise.resolve()),
      );
      this.lastStepSkipped = false;
    } else {
      this.lastStepSkipped = true;
    }
    // Reset the flag after using it
    this.shouldAddNextStep = true;
    return this;
  }

  withCompensation<T, K>(
    compensationFn: (data: T, ...args: any[]) => Promise<K>,
  ): this {
    // Only set the compensation function on the last step if the last step was not skipped
    if (!this.lastStepSkipped) {
      const lastStep = this.steps[this.steps.length - 1] as SagaStep<T, K>;
      lastStep.setCompensationFn(compensationFn);
    }
    // Reset the flag after using it
    this.shouldAddNextStep = true;
    return this;
  }

  withLogger(verbose = this.verbose): this {
    this.logger = logger;
    if (this.sagaName && this.sagaName.trim().length > 0) {
      /* We use a pino Child logger to added a key/value to each logged message */
      this.logger = this.logger.child({ saga: this.sagaName });
    }
    this.verbose = verbose;
    return this;
  }

  build(): Saga {
    if (this.steps.length === 0) {
      throw new Error(
        "Cannot build Saga with 0 steps. Add at least 1 step with invoke()",
      );
    }

    return new Saga(this.sagaName, this.steps, this.logger, this.verbose);
  }
}

/**
 * ### A Saga instance is the orchestrator for a series of steps
 * The Saga has the responsibility to either get the overall business transaction completed
 * or to leave the system in a known termination state.
 *
 * A Saga instance stores its own log. Retrieve it with `saga.getLog()`
 */
class Saga {
  private readonly sagaLog: SagaLog;

  constructor(
    private readonly name: string,
    private readonly steps: SagaStep[],
    logger?: Logger,
    verbose = false,
  ) {
    this.sagaLog = new SagaLog(logger, verbose);
  }

  /**
   * ### Kicks off the Saga to start running each step
   *
   * Loops through each SagaStep and runs the invoke() for that step. If it errors,
   * it will start a rollback().
   *
   * @returns If successful, will return an array containing the output from each step
   */
  async execute(): Promise<any[]> {
    const executedData: any[] = [];

    this.sagaLog.log("info", {
      sagaName: this.name,
      message: `Starting a new Saga with ${this.steps.length} step${
        this.steps.length !== 1 ? "s" : ""
      }`,
    });

    for (const [index, step] of this.steps.entries()) {
      const stepNumber = index + 1;
      try {
        const data = await step.invoke();
        executedData.push(data);
        this.sagaLog.log("debug", {
          sagaName: this.name,
          step: stepNumber,
          stepName: step.getName(),
          message: "Successfully executed step",
          data,
        });
      } catch (error) {
        this.sagaLog.log("error", {
          sagaName: this.name,
          step: stepNumber,
          stepName: step.getName(),
          message: "Failed saga step!",
          data: error as Error,
        });

        await this.rollback(executedData, index);
        throw prefixedError(
          error,
          `Saga error during step ${index + 1}, successfully rolled back.`,
        );
      }
    }
    return executedData;
  }

  async rollback(executedData: any[], fromStepIndex: number): Promise<void> {
    this.sagaLog.log("info", {
      sagaName: this.name,
      step: fromStepIndex + 1,
      message: "Starting rollback of saga",
    });

    for (let i = fromStepIndex; i >= 0; i--) {
      const stepNumber = i + 1;
      try {
        const data = await this.steps[i].compensate(executedData[i]);

        this.sagaLog.log("info", {
          sagaName: this.name,
          step: stepNumber,
          stepName: this.steps[i].getName(),
          message: "Step compensation successful",
          data: data,
        });
      } catch (compensationError) {
        this.sagaLog.log("error", {
          sagaName: this.name,
          step: stepNumber,
          stepName: this.steps[i].getName(),
          message: "Failed to compensate step",
          data: compensationError as Error,
        });

        throw prefixedError(
          compensationError,
          `Compensation for step ${i + 1}`,
        );
      }
    }
    this.sagaLog.log("info", {
      sagaName: this.name,
      step: fromStepIndex + 1,
      message: "Rollback complete.",
    });
  }

  getLog() {
    return this.sagaLog.getData();
  }
}

type SagaLogItem = {
  sagaName: string;
  date?: Date;
  step?: number;
  stepName?: string;
  message: string;
  data?: Record<string, any>;
};

class SagaLog {
  private logger: Logger | undefined;
  private showVerbose: boolean;
  private items: SagaLogItem[] = [];

  constructor(logger?: Logger, verbose = false) {
    this.logger = logger;
    this.showVerbose = verbose;
  }

  log(logType: pino.Level = "debug", sagaLogItem: SagaLogItem): void {
    if (!this.logger) {
      return;
    }

    const { data, ...sagaLogMessage } = { ...sagaLogItem };

    const sagaLogData =
      data instanceof Error
        ? { [config.logger_error_key]: data }
        : { data: data };

    sagaLogMessage.date = sagaLogMessage.date ?? new Date();

    this.items.push(sagaLogItem);

    let loggerMessage = "Saga";
    loggerMessage = loggerMessage.concat(` ('${sagaLogMessage.sagaName}')`);
    if (sagaLogMessage.step != null) {
      loggerMessage = loggerMessage.concat(` Step #${sagaLogMessage.step}`);
    }
    if (sagaLogMessage.stepName?.trim()) {
      loggerMessage = loggerMessage.concat(` ('${sagaLogMessage.stepName}')`);
    }
    loggerMessage = loggerMessage.concat(` >> ${sagaLogMessage.message}`);

    const charLimit = 1000;
    // Remove all whitespaces using replace()
    const logMsgNoSpaces = loggerMessage.replace(/\s/g, "");

    if (logMsgNoSpaces.length > charLimit) {
      loggerMessage =
        loggerMessage.substring(0, charLimit) + "\n\n...(truncated)";
    }

    switch (logType) {
      case "debug":
        this.logger.debug(this.showVerbose ? sagaLogData : {}, loggerMessage);
        break;
      case "info":
        this.logger.info(
          this.showVerbose ? { ...sagaLogData } : {},
          loggerMessage,
        );
        break;
      case "warn":
        this.logger.warn(
          this.showVerbose ? { ...sagaLogData } : {},
          loggerMessage,
        );
        break;
      case "error":
        this.logger.error(
          this.showVerbose ? { ...sagaLogData } : {},
          loggerMessage,
        );
        break;
      case "fatal":
        this.logger.fatal(
          this.showVerbose ? { ...sagaLogData } : {},
          loggerMessage,
        );
        break;
      default:
        this.logger.info(
          this.showVerbose ? { ...sagaLogData } : {},
          loggerMessage,
        );
        break;
    }
  }

  getData(): SagaLogItem[] {
    return this.items;
  }
}
