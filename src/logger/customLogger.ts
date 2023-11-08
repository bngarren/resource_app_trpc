import ecsFormat from "@elastic/ecs-pino-format";
import path from "path";
import pino, { Level } from "pino";
import config from "../config";

const logDirectory = path.join(process.cwd(), config.log_directory); // This points to the project root /logs
const testLogPath = path.join(
  logDirectory,
  `${config.log_file_prefix}_${config.node_env}.log`,
);

type CustomExtra = {
  addBinding: (bindings: pino.Bindings) => void;
  removeBinding: (key: string) => void;
};

export type CustomLogger = pino.Logger & CustomExtra;

const customLogger = (): CustomLogger => {
  let customBindings: {
    [x: string]: any;
  } = {};

  const fileDestination = pino.destination({
    dest: testLogPath,
  });

  const logger = pino(
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

  const originalLogger = logger;
  const customLogger: CustomLogger = Object.create(originalLogger);

  /**
   * ### Shadows the pino logger methods and adds custom bindings
   * Used internally by our customLogger object. When calls are made to the
   * logger from application code, e.g. `logger.info()`, the call will come through
   * this function which will attach our custom bindings.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = (level: Level, objOrMsg?: unknown, ...args: any[]): void => {
    /* Since the pino log fn's are overloaded, i.e. can either have an obj or string
    as the first parameter, we have to figure out if the first parameter is an object... */
    const isObj = typeof objOrMsg === "object" && objOrMsg !== null;
    if (isObj) {
      // We put an Error object on the "errorKey" so that we can also add any
      // custom bindings as well
      if (objOrMsg instanceof Error) {
        logger[level](
          { [config.logger_error_key]: objOrMsg, ...customBindings },
          ...args,
        );
      } else {
        // Otherwise just merged the input object and our custom bindings
        logger[level]({ ...objOrMsg, ...customBindings }, ...args);
      }
    } else {
      // If the first parameter to the log fn is a string, we may still need to insert an
      // object as the first parameter if we have any custom bindings...
      if (Object.keys(customBindings).length > 0) {
        logger[level]({ ...customBindings }, objOrMsg as string, ...args);
      } else {
        // Otherwise just send it as is
        logger[level](objOrMsg as string, ...args);
      }
    }
  };

  /**
   * ### Creates a Pino child logger instance
   * This child logger will **include all customBindings** under the 'nestedKey' (specified in
   * the options when we created the base logger). Since the return type is a regular
   * pino() logger instance, you can no longer call custom methods like addBinding/removeBinding.
   */
  const customChild = <ChildOptions extends pino.ChildLoggerOptions>(
    bindings: pino.Bindings,
    options?: ChildOptions | undefined,
  ) => {
    return logger.child(
      { ...bindings, ...{ [config.logger_nested_key]: { ...customBindings } } },
      options,
    ) as pino.Logger<pino.LoggerOptions & ChildOptions>;
  };

  // Overriding specific log level methods
  customLogger.debug = log.bind(null, "debug");
  customLogger.info = log.bind(null, "info");
  customLogger.warn = log.bind(null, "warn");
  customLogger.error = log.bind(null, "error");
  customLogger.child = customChild;

  customLogger.addBinding = (bindingsObj: pino.Bindings) => {
    customBindings = { ...customBindings, ...bindingsObj };
  };

  customLogger.removeBinding = (key: string) => {
    delete customBindings[key];
  };

  return customLogger;
};

export const logger = customLogger();
