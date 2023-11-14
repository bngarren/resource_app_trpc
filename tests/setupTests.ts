import { addBinding, removeBinding } from "../src/logger/loggerManager";
import { logger } from "./../src/main";

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
  addBinding(logger, { testName: expect.getState().currentTestName });
});

afterEach(() => {
  removeBinding(logger, "testName");
});
