import { TRPCError } from "@trpc/server";
import config from "../src/config";
import { logger } from "../src/logger/customLogger";

it("customLogger should work", async () => {
  logger.error(new Error("Kaboom!"), "Custom error message!");

  logger.warn({ param1: "Test", param2: "Test2" }, "My warning message");

  logger.addBinding({ anotherKey: "anotherValue" });

  logger.debug("DEBUG this");

  logger.removeBinding("anotherKey");

  logger.error({
    [config.logger_error_key]: new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Test internal server error!!",
    }),
  });
});
