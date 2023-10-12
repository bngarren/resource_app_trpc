import { Logger } from "pino";
/* eslint-disable @typescript-eslint/no-explicit-any */

/*
TODO: Add retry capability to Saga
*/

import { prefixedError } from "./prefixedError";

type InvokeFnType<T> = (...args: any[]) => Promise<T>;
type CompensationFnType<T> = (data: T, ...args: any[]) => Promise<void>;

/**
 * ### A step (local transaction) in the Saga
 * Contains an `invokeFn` that is the foward step and a `compensationFn` that
 * is the rollback/reversal of the invokeFn.
 *
 * The generic type `T` represents the output of the `invokeFn` which is passed
 * as the first parameter of the `compensationFn`.
 */
class SagaStep<T = any> {
  private wasInvoked: boolean;
  private invokeResult: T;

  constructor(
    private name: string,
    private invokeFn: InvokeFnType<T>,
    private compensationFn: CompensationFnType<T>,
  ) {
    this.wasInvoked = false;
  }

  async invoke(...args: unknown[]): Promise<T> {
    this.wasInvoked = true;
    this.invokeResult = await this.invokeFn(...args);
    return this.invokeResult;
  }

  async compensate(...args: unknown[]): Promise<void> {
    if (this.wasInvoked) {
      await this.compensationFn(this.invokeResult, ...args);
    }
  }

  setInvokeFn(newInvokeFn: InvokeFnType<T>) {
    this.invokeFn = newInvokeFn;
  }

  setCompensationFn(newCompensationFn: CompensationFnType<T>) {
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
 */
export class SagaBuilder {
  private steps: SagaStep[] = [];
  private logger: Logger;

  invoke<T>(invokeFn: () => Promise<T>, name?: string): this {
    this.steps.push(
      new SagaStep<T>(name ?? "", invokeFn, () => Promise.resolve()),
    );
    return this;
  }

  withCompensation<T>(
    compensationFn: (data: T, ...args: any[]) => Promise<void>,
  ): this {
    const lastStep = this.steps[this.steps.length - 1] as SagaStep<T>;
    lastStep.setCompensationFn(compensationFn);
    return this;
  }

  withLogger(logger: Logger): this {
    this.logger = logger;
    return this;
  }

  build(): Saga {
    if (this.steps.length === 0) {
      throw new Error(
        "Cannot build Saga with 0 steps. Add at least 1 invoke()",
      );
    }

    return new Saga(this.steps, this.logger);
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

  constructor(private readonly steps: SagaStep[], logger?: Logger) {
    this.sagaLog = new SagaLog(logger);
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

    this.sagaLog.log(
      0,
      "",
      `Starting a new Saga with ${this.steps.length} steps!`,
    );

    for (const [index, step] of this.steps.entries()) {
      const stepNumber = index + 1;
      try {
        const data = await step.invoke();
        executedData.push(data);
        this.sagaLog.log(stepNumber, step.getName(), "Execute success.");
      } catch (error) {
        const errMsg = "Saga step failed.";
        this.sagaLog.log(stepNumber, step.getName(), errMsg);
        await this.rollback(executedData, index);
        throw prefixedError(error, `${errMsg} During step ${index + 1}`);
      }
    }
    return executedData;
  }

  async rollback(executedData: any[], fromStepIndex: number): Promise<void> {
    this.sagaLog.log(fromStepIndex + 1, "", "Starting rollback.");
    for (let i = fromStepIndex; i >= 0; i--) {
      const stepNumber = i + 1;
      try {
        await this.steps[i].compensate(executedData[i]);
        this.sagaLog.log(
          stepNumber,
          this.steps[i].getName(),
          "Compensation successful.",
        );
      } catch (compensationError) {
        const errMsg = "Saga failed to compensate.";
        this.sagaLog.log(stepNumber, this.steps[i].getName(), errMsg);
        throw prefixedError(compensationError, `${errMsg} Step ${i + 1}`);
      }
    }
    this.sagaLog.log(fromStepIndex + 1, "", "Rollback complete.");
  }

  getLog() {
    return this.sagaLog.getData();
  }
}

type SagaLogMessage = {
  date: Date;
  step: number;
  name: string;
  message: string;
};

class SagaLog {
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  private data: SagaLogMessage[] = [];

  log(step: number, name: string, message: string): void {
    const sagaLogMessage = {
      date: new Date(),
      step,
      name,
      message,
    };
    this.data.push(sagaLogMessage);

    if (this.logger) {
      this.logger.debug(sagaLogMessage);
    }
  }

  getData(): SagaLogMessage[] {
    return this.data;
  }
}
