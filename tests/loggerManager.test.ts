import { Logger } from "pino";
import {
  addBinding,
  getLogger,
  loggerManager,
} from "../src/logger/loggerManager";

describe("loggerManager", () => {
  let manager: ReturnType<typeof loggerManager>;
  let testLogger: ReturnType<typeof getLogger>;
  let mockBaseLogger: Partial<Logger>;
  let methodSpies: {
    [x: string]: jest.SpyInstance;
  };
  let originalMethodSpies: {
    [x: string]: jest.SpyInstance;
  };

  beforeEach(() => {
    // Create a mock base logger
    mockBaseLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      child: jest.fn().mockImplementation(() => mockBaseLogger),
    };

    // Inject the mock base logger
    manager = loggerManager(mockBaseLogger as Logger);
    testLogger = manager.getLogger();

    // Create spies on the original methods after they have been passed to loggerManager
    methodSpies = {
      debug: jest.spyOn(mockBaseLogger, "debug"),
      info: jest.spyOn(mockBaseLogger, "info"),
      warn: jest.spyOn(mockBaseLogger, "warn"),
      error: jest.spyOn(mockBaseLogger, "error"),
      fatal: jest.spyOn(mockBaseLogger, "fatal"),
      child: jest.spyOn(mockBaseLogger, "child"),
    };

    originalMethodSpies = {
      debug: jest.spyOn(
        manager.getOriginalMethods(testLogger) as typeof mockBaseLogger,
        "debug",
      ),
      info: jest.spyOn(
        manager.getOriginalMethods(testLogger) as typeof mockBaseLogger,
        "info",
      ),
      warn: jest.spyOn(
        manager.getOriginalMethods(testLogger) as typeof mockBaseLogger,
        "warn",
      ),
      error: jest.spyOn(
        manager.getOriginalMethods(testLogger) as typeof mockBaseLogger,
        "error",
      ),
      fatal: jest.spyOn(
        manager.getOriginalMethods(testLogger) as typeof mockBaseLogger,
        "fatal",
      ),
    };
  });

  afterEach(() => {
    Object.values(methodSpies).forEach((spy) => spy.mockRestore());
  });

  it.each(["debug", "info", "warn", "error", "fatal"])(
    "should call %s method correctly with string argument",
    (method) => {
      testLogger[method]("Test message");
      expect(methodSpies[method]).toHaveBeenCalledWith("Test message");

      expect(originalMethodSpies[method]).toHaveBeenCalledWith("Test message");
    },
  );

  it.each(["debug", "info", "warn", "error", "fatal"])(
    "should call %s method correctly with obj argument",
    (method) => {
      testLogger[method]({ foo: "bar" });
      expect(methodSpies[method]).toHaveBeenCalledWith(
        expect.objectContaining({ foo: "bar" }),
      );
      expect(originalMethodSpies[method]).toHaveBeenCalledWith(
        expect.objectContaining({ foo: "bar" }),
      );
    },
  );

  it.each(["debug", "info", "warn", "error", "fatal"])(
    "should call a child logger %s method correctly with string argument",
    (method) => {
      const childTestLogger = testLogger.child({ child: true });
      childTestLogger[method]("Test message");
      expect(methodSpies[method]).toHaveBeenCalledWith("Test message");
      expect(originalMethodSpies[method]).toHaveBeenCalledWith("Test message");
    },
  );

  it("should create a child logger with inherited bindings", () => {
    manager.addBinding(testLogger, { key: "value" });

    const childLogger = testLogger.child({ childKey: "childValue" });
    childLogger.info("Child logger test");

    expect(methodSpies.child).toHaveBeenCalledWith({ childKey: "childValue" });

    expect(originalMethodSpies.info).toHaveBeenCalledWith(
      expect.objectContaining({ key: "value" }),
      "Child logger test",
    );

    manager.removeBinding(testLogger, "key");

    const childLogger2 = testLogger.child({ app: "ARCANE_PROSPECTOR!" });
  });
});

it("should test app's logger", () => {
  const logger = getLogger();

  logger.info("Test info message");

  const childLogger = logger.child({ childKey: "childKey" });
  childLogger.info("Test info child logger message");

  addBinding(logger, { customBinding: "customBinding" });

  logger.info("Test info message with custom binding");

  childLogger.info("Repeat info child logger message");

  const childLogger2 = logger.child({ childKey2: "childKey2" });

  childLogger2.info("Test info child logger 2 message with custom binding");
});
