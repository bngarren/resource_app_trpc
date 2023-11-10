import ecsFormat from "@elastic/ecs-pino-format";
import path from "path";
import pino, { BaseLogger, Bindings, LogFn, Logger, LoggerOptions } from "pino";
import config from "../config";

const logDirectory = path.join(process.cwd(), config.log_directory); // This points to the project root /logs
const testLogPath = path.join(
  logDirectory,
  `${config.log_file_prefix}_${config.node_env}.log`,
);

export const getBaseLogger = () => {
  const fileDestination = pino.destination({
    dest: testLogPath,
  });
  return pino(
    {
      ...ecsFormat({ convertErr: true }),
      level: "debug",
      sync: true,
      timestamp: () =>
        `,"${config.logger_timestamp_key}":"${new Date().toISOString()}"`,
      nestedKey: config.logger_nested_key,
      errorKey: config.logger_error_key,
    },
    fileDestination,
  ).child({
    app: config.app_name,
    node_env: config.node_env,
  });
};

export const loggerManager = (baseLogger: Logger) => {
  const loggerBindings = new Map<Logger, Bindings>();
  const loggerOriginalMethods = new Map<
    Logger,
    Partial<{ [K in keyof BaseLogger]: LogFn }>
  >();

  const addBinding = (logger: pino.Logger, bindings: pino.Bindings) => {
    const currentBindings = loggerBindings.get(logger) || {};
    loggerBindings.set(logger, { ...currentBindings, ...bindings });
  };

  const removeBinding = (logger: pino.Logger, key: string) => {
    const currentBindings = loggerBindings.get(logger) || {};
    delete currentBindings[key];
    loggerBindings.set(logger, currentBindings);
  };

  const getBindings = (logger: pino.Logger): pino.Bindings => {
    return { ...loggerBindings.get(logger) } || {};
  };

  const getOriginalMethods = (logger: pino.Logger) => {
    return loggerOriginalMethods.get(logger);
  };

  const getLogger = () => baseLogger;

  /**
   * ### Shadows the pino logger methods and adds custom bindings

   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function log(
    this: Logger,
    originalMethod: LogFn,
    objOrMsg?: unknown,
    ...args: any[]
  ): void {
    const bindings = getBindings(this);
    /* Since the pino log fn's are overloaded, i.e. can either have an obj or string
    as the first parameter, we have to figure out if the first parameter is an object... */
    const isObj = typeof objOrMsg === "object" && objOrMsg !== null;
    if (isObj) {
      // We put an Error object on the "errorKey" so that we can also add any
      // custom bindings as well
      if (objOrMsg instanceof Error) {
        originalMethod(
          { [config.logger_error_key]: objOrMsg, ...bindings },
          ...args,
        );
      } else {
        // Otherwise just merged the input object and our custom bindings
        originalMethod({ ...objOrMsg, ...bindings }, ...args);
      }
    } else {
      // If the first parameter to the log fn is a string, we may still need to insert an
      // object as the first parameter if we have any custom bindings...
      if (Object.keys(bindings).length > 0) {
        originalMethod({ ...bindings }, objOrMsg as string, ...args);
      } else {
        // Otherwise just send it as is
        originalMethod(objOrMsg as string, ...args);
      }
    }
  }

  function overrideMethods(logger: Logger & BaseLogger) {
    // Keep references to the original Pino methods
    // Keep references to the original Pino methods
    const originalMethods: Partial<{ [K in keyof BaseLogger]: LogFn }> = {
      debug: logger.debug.bind(logger),
      info: logger.info.bind(logger),
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger),
      fatal: logger.fatal.bind(logger),
    };

    loggerOriginalMethods.set(logger, originalMethods);

    const originalChild = logger.child.bind(logger);

    // Use the original methods inside your custom log method
    logger.debug = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.debug!, objOrMsg, ...args);
    };
    logger.info = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.info!, objOrMsg, ...args);
    };
    logger.warn = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.warn!, objOrMsg, ...args);
    };
    logger.error = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.error!, objOrMsg, ...args);
    };
    logger.fatal = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.fatal!, objOrMsg, ...args);
    };
    logger.child = <ChildOptions extends pino.ChildLoggerOptions>(
      bindings: pino.Bindings,
      options?: ChildOptions | undefined,
    ) => {
      const customChildWithOptions: (
        this: Logger,
        bindings: pino.Bindings,
        options: ChildOptions | undefined,
        originalChild: (
          bindings: pino.Bindings,
          options?: ChildOptions,
        ) => Logger<ChildOptions>,
      ) => Logger<ChildOptions> = customChild as any;

      return customChildWithOptions.call(
        logger,
        bindings,
        options,
        originalChild,
      );
    };
  }

  /**
   * ### Creates a Pino child logger instance

   */
  function customChild<ChildOptions extends pino.ChildLoggerOptions>(
    this: Logger,
    bindings: pino.Bindings,
    options: ChildOptions | undefined,
    originalChild: (
      bindings: pino.Bindings,
      options?: ChildOptions,
    ) => Logger<LoggerOptions & ChildOptions>,
  ) {
    const childLogger = originalChild.bind(this)(bindings, options);
    loggerBindings.set(childLogger, {
      ...getBindings(this),
      // ...bindings,
    });
    overrideMethods(childLogger);
    return childLogger;
  }

  // Overriding specific log level methods
  overrideMethods(baseLogger);

  return {
    addBinding,
    removeBinding,
    getLogger,
    getOriginalMethods,
  };
};

const manager = loggerManager(getBaseLogger());
export const { addBinding, removeBinding, getLogger } = manager;
