import { SagaBuilder } from "./../src/util/saga";
import { logger } from "../src/logger/logger";
import { prefixedError } from "../src/util/prefixedError";

describe("saga", () => {
  beforeAll(() => {
    logger.info("Starting test suite: saga");
  });

  it("should throw error if build() is called with zero invoke() called", async () => {
    expect(new SagaBuilder().build).toThrow();
  });

  it("should correctly invoke a saga step", async () => {
    const testFunction1 = jest.fn(async () => Promise.resolve());

    const saga = new SagaBuilder().invoke(testFunction1).build();

    try {
      await saga.execute();
    } catch (error) {
      console.error(prefixedError(error, ""));
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
    }
  });

  it("should correctly invoke multiple saga steps", async () => {
    const testFunction1 = jest.fn(async () => Promise.resolve(1));
    const testFunction2 = jest.fn(async () => Promise.resolve(2));
    const testFunction3 = jest.fn(async () => Promise.resolve(3));

    const saga = new SagaBuilder()
      .invoke(testFunction1)
      .invoke(testFunction2)
      .invoke(testFunction3)
      .build();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any[] = [];
    try {
      result = await saga.execute();
    } catch (error) {
      console.error(prefixedError(error, ""));
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
      expect(testFunction2).toBeCalledTimes(1);
      expect(testFunction3).toBeCalledTimes(1);

      expect(result).toEqual([1, 2, 3]);
    }
  });

  it("should rollback a 1 step saga", async () => {
    const testFunction1 = jest.fn(async () => Promise.reject());
    const compensationFunction1 = jest.fn(async () => Promise.resolve());

    const saga = new SagaBuilder()
      .invoke(testFunction1)
      .withCompensation(compensationFunction1)
      .build();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any[] = [];
    try {
      result = await saga.execute();
    } catch (error) {
      // Ignore. We expect an error for this test
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
      expect(compensationFunction1).toBeCalledTimes(1);
      expect(result.length).toBe(0);
    }
  });

  it("should invoke 3 steps, fail on the final, and rollback all", async () => {
    const orig_testDatabase = [
      {
        id: "initial",
      },
    ];

    let testDatabase = [...orig_testDatabase];

    const testFunction1 = jest.fn(async () =>
      Promise.resolve(testDatabase.push({ id: "one" })),
    );
    const compensationFunction1 = jest.fn(async () => {
      testDatabase = testDatabase.filter((el) => el.id !== "one");
      Promise.resolve();
    });
    const testFunction2 = jest.fn(async () =>
      Promise.resolve(testDatabase.push({ id: "two" })),
    );
    const compensationFunction2 = jest.fn(async () => {
      testDatabase = testDatabase.filter((el) => el.id !== "two");
      Promise.resolve();
    });

    // The 3rd invokeFn will fail here to initiate the rollback
    const testFunction3 = jest.fn(async () => Promise.reject());

    const compensationFunction3 = jest.fn(async () => {
      testDatabase = testDatabase.filter((el) => el.id !== "three");
      Promise.resolve();
    });

    const saga = new SagaBuilder()
      .invoke(testFunction1, "testFunction1")
      .withCompensation(compensationFunction1)
      .invoke(testFunction2, "testFunction2")
      .withCompensation(compensationFunction2)
      .invoke(testFunction3, "testFunction3")
      .withCompensation(compensationFunction3)
      .build();

    try {
      await saga.execute();
    } catch (error) {
      // Ignore. We expect an error for this test
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
      expect(testFunction2).toBeCalledTimes(1);
      expect(testFunction3).toBeCalledTimes(1);
      expect(compensationFunction1).toBeCalledTimes(1);
      expect(compensationFunction2).toBeCalledTimes(1);
      expect(compensationFunction3).toBeCalledTimes(1);

      // Our simple "database" should look like it did BEFORE the saga started
      expect(testDatabase).toEqual(orig_testDatabase);
    }
  });
});