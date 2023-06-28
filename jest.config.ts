import type { JestConfigWithTsJest } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.ts"],
};

export default jestConfig;
