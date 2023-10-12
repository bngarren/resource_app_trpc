/* eslint-disable @typescript-eslint/no-explicit-any */

import { prefixedError } from "./prefixedError";

type InvokeFnType = (...args: any[]) => Promise<any>;
type CompensationFnType = (...args: any[]) => Promise<void>;

class SagaStep {
  private wasInvoked: boolean;
  private invokeResult: any;

  constructor(
    private invokeFn: InvokeFnType,
    private compensationFn: CompensationFnType,
  ) {
    this.wasInvoked = false;
  }

  async invoke(...args: unknown[]): Promise<unknown> {
    this.wasInvoked = true;
    this.invokeResult = await this.invokeFn(...args);
    return this.invokeResult;
  }

  async compensate(...args: unknown[]): Promise<void> {
    if (this.wasInvoked) {
      await this.compensationFn(this.invokeResult, ...args);
    }
  }

  setinvokeFn(newInvokeFn: InvokeFnType) {
    this.invokeFn = newInvokeFn;
  }

  setCompensationFn(newCompensationFn: CompensationFnType) {
    this.compensationFn = newCompensationFn;
  }
}

export class SagaBuilder {
  private steps: Array<SagaStep> = [];

  invoke<T>(invokeFn: () => Promise<T>): this {
    this.steps.push(new SagaStep(invokeFn, () => Promise.resolve()));
    return this;
  }

  withCompensation<T>(compensationFn: (data: T) => Promise<void>): this {
    const lastStep = this.steps[this.steps.length - 1] as SagaStep;
    lastStep.setCompensationFn(compensationFn);
    return this;
  }

  build(): Saga {
    return new Saga(this.steps);
  }
}

class Saga {
  constructor(private readonly steps: Array<SagaStep>) {}

  async execute(): Promise<any[]> {
    const executedData: any[] = [];

    for (const [index, step] of this.steps.entries()) {
      try {
        const data = await step.invoke();
        executedData.push(data);
      } catch (error) {
        await this.rollback(executedData);
        throw prefixedError(error, `Saga failed during step ${index + 1}`);
      }
    }
    return executedData;
  }

  async rollback(executedData: any[]): Promise<void> {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      try {
        await this.steps[i].compensate(executedData[i]);
      } catch (compensationError) {
        throw prefixedError(
          compensationError,
          `Saga failed to compensate step ${i + 1}`,
        );
      }
    }
  }
}
