import { resetPrisma } from "./testHelpers";
import { TestSingleton } from "./TestSingleton";

beforeAll(async () => {
  await TestSingleton.getInstance().ready;

  await resetPrisma();
});

afterAll(async () => {
  await TestSingleton.getInstance().teardown();
});
