import { TRPCError } from "@trpc/server";
import { addBinding, removeBinding } from "../src/logger/loggerManager";
import { logger } from "../src/main";
import config from "../src/config";

it("customLogger should work", async () => {
  logger.error(new Error("Kaboom!"), "Custom error message!");

  logger.warn({ param1: "Test", param2: "Test2" }, "My warning message");

  addBinding(logger, { anotherKey: "anotherValue" });

  logger.debug("DEBUG this");

  const childLogger = logger.child({ child: true });

  childLogger.info({ foo: "bar" }, "Test");

  removeBinding(logger, "anotherKey");

  logger.error({
    [config.logger_error_key]: new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Test internal server error!!",
    }),
  });
});
