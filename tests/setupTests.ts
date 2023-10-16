import { logger } from "../src/logger/logger";
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
  logger.info(expect.getState().currentTestName);
});
