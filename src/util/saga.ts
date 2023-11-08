import { Logger, pino } from "pino";
/* eslint-disable @typescript-eslint/no-explicit-any */

/*
TODO: Add retry capability to Saga
*/

import { prefixedError } from "./prefixedError";
import { logger } from "../main";

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
  private context: string | undefined;
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

  constructor(context?: string) {
    this.context = context;
    this.verbose = false;
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

  invoke<T>(invokeFn: () => Promise<T>, name?: string): this {
    if (this.shouldAddNextStep) {
      this.steps.push(
        new SagaStep<T>(name ?? "", invokeFn, () => Promise.resolve()),
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
    if (this.context && this.context.trim().length > 0) {
      this.logger = this.logger.child({ saga: this.context });
    }
    this.verbose = verbose;
    return this;
  }

  build(): Saga {
    if (this.steps.length === 0) {
      throw new Error(
        "Cannot build Saga with 0 steps. Add at least 1 invoke()",
      );
    }

    return new Saga(this.steps, this.logger, this.verbose);
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
          step: stepNumber,
          name: step.getName(),
          message: "Executed step.",
          data,
        });
      } catch (error) {
        const errMsg = "Saga step failed.";
        this.sagaLog.log("error", {
          step: stepNumber,
          name: step.getName(),
          message: prefixedError(error, errMsg).message,
        });

        await this.rollback(executedData, index);
        throw prefixedError(error, `${errMsg} During step ${index + 1}`);
      }
    }
    return executedData;
  }

  async rollback(executedData: any[], fromStepIndex: number): Promise<void> {
    this.sagaLog.log("info", {
      step: fromStepIndex + 1,
      message: "Starting rollback.",
    });

    for (let i = fromStepIndex; i >= 0; i--) {
      const stepNumber = i + 1;
      try {
        const data = await this.steps[i].compensate(executedData[i]);

        this.sagaLog.log("info", {
          step: stepNumber,
          name: this.steps[i].getName(),
          message: "Compensation successful.",
          data,
        });
      } catch (compensationError) {
        const errMsg = "Saga failed to compensate.";
        this.sagaLog.log("error", {
          step: stepNumber,
          name: this.steps[i].getName(),
          message: errMsg,
        });

        throw prefixedError(compensationError, `${errMsg} Step ${i + 1}`);
      }
    }
    this.sagaLog.log("info", {
      step: fromStepIndex + 1,
      message: "Rollback complete.",
    });
  }

  getLog() {
    return this.sagaLog.getData();
  }
}

type SagaLogMessage = {
  date?: Date;
  step?: number;
  name?: string;
  message: string;
  data?: Record<string, any>;
};

class SagaLog {
  private logger: Logger | undefined;
  private showVerbose: boolean;

  constructor(logger?: Logger, verbose = false) {
    this.logger = logger;
    this.showVerbose = verbose;
  }

  private data: SagaLogMessage[] = [];

  log(logType: pino.Level = "debug", payload: SagaLogMessage): void {
    const sagaLogMessage = { ...payload };

    sagaLogMessage.date = sagaLogMessage.date ?? new Date();

    this.data.push(sagaLogMessage);

    if (this.logger) {
      let logMsg = `- - Saga - -${
        sagaLogMessage.step !== undefined
          ? ` [Step=${sagaLogMessage.step}]`
          : ""
      }${sagaLogMessage.name?.trim() ? ` [Name=${sagaLogMessage.name}]` : ""} ${
        sagaLogMessage.message
      } `;

      if (sagaLogMessage.data && this.showVerbose) {
        logMsg += `\nOutput data: ${JSON.stringify(
          sagaLogMessage.data,
          null,
          2,
        )}`;
      }

      const charLimit = 1000;
      // Remove all whitespaces using replace()
      const logMsgNoSpaces = logMsg.replace(/\s/g, "");

      if (logMsgNoSpaces.length > charLimit) {
        logMsg = logMsg.substring(0, charLimit) + "\n\n...(truncated)";
      }

      switch (logType) {
        case "debug":
          this.logger.debug(logMsg);
          break;
        case "info":
          this.logger.info(logMsg);
          break;
        case "warn":
          this.logger.warn(logMsg);
          break;
        case "error":
          this.logger.error(logMsg);
          break;
        case "fatal":
          this.logger.fatal(logMsg);
          break;
        default:
          this.logger.info(logMsg);
          break;
      }
    }
  }

  getData(): SagaLogMessage[] {
    return this.data;
  }
}
