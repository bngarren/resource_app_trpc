import { SagaBuilder } from "./../src/util/saga";
import { logger } from "../src/main";
import { getTestFilename } from "./testHelpers";

describe("saga", () => {
  beforeAll(() => {
    logger.info(
      `Starting test suite located at: ${getTestFilename(__filename)}`,
    );
  });

  it("should throw error if build() is called with zero invoke() called", async () => {
    expect(new SagaBuilder("test saga").withLogger().build).toThrow();
  });

  it("should correctly invoke a saga step", async () => {
    const testFunction1 = jest.fn(async () => Promise.resolve());

    const saga = new SagaBuilder("test saga")
      .withLogger()
      .invoke(testFunction1)
      .build();

    try {
      await saga.execute();
    } catch (error) {
      logger.error(error);
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
    }
  });

  it("should correctly invoke multiple saga steps", async () => {
    const testFunction1 = jest.fn(async () => Promise.resolve(1));
    const testFunction2 = jest.fn(async () => Promise.resolve(2));
    const testFunction3 = jest.fn(async () => Promise.resolve(3));

    const saga = new SagaBuilder("test saga")
      .withLogger()
      .invoke(testFunction1)
      .invoke(testFunction2)
      .invoke(testFunction3)
      .build();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any[] = [];
    try {
      result = await saga.execute();
    } catch (error) {
      logger.error(error);
    } finally {
      expect(testFunction1).toBeCalledTimes(1);
      expect(testFunction2).toBeCalledTimes(1);
      expect(testFunction3).toBeCalledTimes(1);

      expect(result).toEqual([1, 2, 3]);
    }
  });

  it("should rollback a 1 step saga", async () => {
    const testFunction1 = jest.fn(async () =>
      Promise.reject(new Error("A mock error has occured!")),
    );
    const compensationFunction1 = jest.fn(async () => Promise.resolve());

    const saga = new SagaBuilder("test saga")
      .withLogger()
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
    const testFunction3 = jest.fn(async () =>
      Promise.reject(new Error("A mock error has occured!")),
    );

    const compensationFunction3 = jest.fn(async () => {
      testDatabase = testDatabase.filter((el) => el.id !== "three");
      Promise.resolve();
    });

    const saga = new SagaBuilder("test saga")
      .withLogger()
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

  it("should correctly skip a step that uses a `when()` that is passed a false", async () => {
    // We run the below tests for each of the elements in this array
    const predicates = [false, () => false];

    await Promise.all(
      predicates.map(async (predicate) => {
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
        const testFunction3 = jest.fn(async () =>
          Promise.resolve(testDatabase.push({ id: "three" })),
        );
        const compensationFunction3 = jest.fn(async () => {
          testDatabase = testDatabase.filter((el) => el.id !== "three");
          Promise.resolve();
        });
        // Make this testFunction4 fail so that all are rolled back
        const testFunction4 = jest.fn(async () => Promise.reject());
        const compensationFunction4 = jest.fn(async () => {
          testDatabase = testDatabase.filter((el) => el.id !== "four");
          Promise.resolve();
        });

        const saga = new SagaBuilder("test saga")
          .withLogger()
          .invoke(testFunction1, "testFunction1")
          .withCompensation(compensationFunction1)
          // Should not add the testFunction2 step invoke() or withCompensation()
          .when(predicate)
          .invoke(testFunction2, "testFunction2")
          .withCompensation(compensationFunction2)
          // Should add testFunction 3
          .invoke(testFunction3, "testFunction3")
          .withCompensation(compensationFunction3)
          .invoke(testFunction4, "testFunction4")
          // Should add testFunction 4
          .withCompensation(compensationFunction4)
          .build();

        try {
          await saga.execute();
        } catch (error) {
          // Ignore. We expect an error for this test
        } finally {
          expect(testFunction1).toBeCalledTimes(1);
          expect(testFunction2).toBeCalledTimes(0); // should have skipped
          expect(testFunction3).toBeCalledTimes(1);
          expect(testFunction4).toBeCalledTimes(1);
          expect(compensationFunction1).toBeCalledTimes(1);
          expect(compensationFunction2).toBeCalledTimes(0); // should have skipped
          expect(compensationFunction3).toBeCalledTimes(1);
          expect(compensationFunction4).toBeCalledTimes(1);

          // Our simple "database" should look like it did BEFORE the saga started
          expect(testDatabase).toEqual(orig_testDatabase);
        }
      }),
    );
  });
});
