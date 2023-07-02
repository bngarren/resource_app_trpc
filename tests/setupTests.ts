import { TestSingleton } from "./TestSingleton";

beforeAll(async () => {
  await TestSingleton.getInstance().ready;
});

afterAll(async () => {
  await TestSingleton.getInstance().teardown();
});
