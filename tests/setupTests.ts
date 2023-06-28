import { TestSingleton } from "./TestSingleton";

export {};

beforeAll(async () => {
  await TestSingleton.getInstance().ready;
});

afterAll(async () => {
  await TestSingleton.getInstance().teardown();
});
