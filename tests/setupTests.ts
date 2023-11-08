import { logger } from "./../src/logger/customLogger";

import { resetPrisma } from "./testHelpers";
import { TestSingleton } from "./TestSingleton";

beforeAll(async () => {
  await TestSingleton.getInstance().ready;

  await resetPrisma();
});

afterAll(async () => {
  await TestSingleton.getInstance().teardown();
});

beforeEach(() => {
  logger.addBinding({ testName: expect.getState().currentTestName });
});

afterEach(() => {
  logger.removeBinding("testName");
});
