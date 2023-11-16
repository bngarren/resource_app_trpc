/* eslint-disable @typescript-eslint/no-unsafe-argument */ // Disabled because we spread "...args" (as any[]) alot to work with pino
import ecsFormat from "@elastic/ecs-pino-format";
import path from "path";
import pino, { Bindings, LogFn, Logger, LoggerOptions, symbols } from "pino";
import config, { NodeEnvironment } from "../config";

const logDirectory = path.join(process.cwd(), config.log_directory); // This points to the project root /logs
const logFilePath = path.join(
  logDirectory,
  `${config.log_file_prefix}_${config.node_env}.log`,
);

/**
 * ### Creates a logger instance, using Pino
 *
 * The `baseLabels` param is a key-value object whose key/values are added under
 * the log JSON's root-level `labels` key to preserve ECS compatability. This is **where we can pass
 * key/values we want on our base logger**, e.g. app_name, node_env, etc.
 *
 * The returned logger uses synchronous logging for the 'test' environment and asynchronous for all others.
 */
export const getBaseLogger = (
  nodeEnvironment: NodeEnvironment,
  baseLabels?: pino.Bindings,
) => {
  const baseOptions: pino.LoggerOptions = {
    ...ecsFormat({ convertErr: true }),
    level: "debug",
    timestamp: () =>
      `,"${config.logger_timestamp_key}":"${new Date().toISOString()}"`,
    nestedKey: config.logger_nested_key,
    errorKey: config.logger_error_key,
  };

  const shouldUseSync = ["test"].includes(config.node_env);

  const fileDestination = pino.destination({
    dest: logFilePath,
    sync: shouldUseSync,
  });

  let _logger: Logger;

  switch (nodeEnvironment) {
    case "development":
      _logger = pino({ ...baseOptions }, fileDestination);
      break;
    case "test":
      _logger = pino({ ...baseOptions }, fileDestination);
      break;
    case "staging":
      _logger = pino({ ...baseOptions }, fileDestination);
      break;
    case "production":
      _logger = pino({ ...baseOptions }, fileDestination);
      break;
  }

  return baseLabels ? _logger.child({ labels: baseLabels }) : _logger;
};

type LoggerManagerOptions = {
  /**
   * The name of the key that child bindings will be nested under. If empty, null, or undefined,
   * child bindings will appear at the root of the JSON log.
   *
   * Child bindings will appear in the JSON output as dot notation rather than grouped under a single
   * key and object.
   *
   * _Example_
   * ```
   * {"childNestedKey.foo": "bar", "childNestedKey.baz": true}
   * ```
   *
   * Processors in an Elasticsearch pipeline (ES, logstash, filebeat) can expand this dot notation into an object field.
   *
   * See: https://www.elastic.co/guide/en/elasticsearch/reference/current/dot-expand-processor.html
   */
  childNestedKey?: string;
  /**
   * Keys that are not allowed to be set through `child()`.
   * If you set certain keys on the logger and do not want them later overwritten by a
   * `child()` call, put those keys in this array. If a restricted key is included in the bindings
   * object passed to child(), it will be ignored.
   */
  childRestrictedKeys?: string[];
};

export type LoggerManagerLogFnKey =
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

/**
 * ### Logger manager
 *
 * #### Summary
 * The loggerManager wraps a single base logger instance (e.g. from Pino) and provides mechanisms
 * to add bindings to the logger instance (which will be nested under the 'nestedKey' of the base logger) and to create
 * child loggers whose bindings will be nested under the 'childNestedKey' key, if specified.
 *
 * #### Example
 * - In our testing environment, we can add a binding to the app's logger instance that includes
 * the test's name, i.e. `{testName: "/endpoint should return 200"}`.
 *
 * #### Child
 * - When bindings are passed to child(), these will be placed at the root level (default for pino), or placed under
 * the 'childNestedKey', if specified in the LoggerManagerOptions
 *   - If 'childNestedKey' is used, the key/values will appear in the JSON output as 'dot notation', e.g.
 * `{"childNestedKey.foo": "bar", "childNestedKey.baz": true}`
 * - If you would like some child bindings placed at the root level and all others within a nested key, consider
 * adding these top level bindings on the base logger that is passed into loggerManager().
 *
 * #### Notes
 * - The loggerManager receives a single base logger instance and provides a `getLogger()` method to
 * return this same instance
 *   - We create a base logger using separate `getBaseLogger()` function
 * - When a log method (e.g., debug, info, warn, error) is called on this logger instance, it is
 * directed through our custom `log()` function. This is because we have overwritten the logger's methods.
 * - Within the log() function, we add any custom bindings that we have added to this logger and then
 * call the native/original log method.
 * - The loggerManager maintains state for the base and child loggers, including custom bindings (loggerBindings)
 * and their original methods (loggerOriginalMethods). The latter is helpful to have for testing this code, i.e. to
 * spy on the original methods and make sure they are called with correct arguments.
 * - Bindings added to the base or child logger through `addBinding()` are nested under the [nestedKey], defined in the options
 */
export const loggerManager = (
  baseLogger: Logger,
  opts?: LoggerManagerOptions,
) => {
  const loggerBindings = new Map<Logger, Bindings>();

  type OriginalMethods = {
    [K in LoggerManagerLogFnKey]: LogFn;
  };
  const loggerOriginalMethods = new Map<Logger, OriginalMethods>();

  const originalChildFunction = (
    Object.create(baseLogger) as Logger
  ).child.bind(baseLogger);

  const restrictedLabels = opts?.childRestrictedKeys || [];

  // ! FOR DEBUGGING -- --
  const objectWeakMap = new WeakMap<object, number>();
  let idCounter = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, unused-imports/no-unused-vars
  function trackObject(obj: object) {
    if (!objectWeakMap.has(obj)) {
      objectWeakMap.set(obj, ++idCounter);
    }
    return objectWeakMap.get(obj);
  }
  // ! -- --
  /**
   * ### Adds a key/value pair to the JSON log
   * In pino, this will add a key/value to the 'mergedObject' passed to the log functions.
   *
   * If a `nestedKey` option is set in the options of the base logger, then this binding will appear within this nestedKey.
   *
   * @param logger The logger to which you wish to add this custom binding
   * @param bindings This is an object of keys (strings) and values (any). Can have nested objects.
   */
  const addBinding = (logger: pino.Logger, bindings: pino.Bindings) => {
    const currentBindings = loggerBindings.get(logger) || {};
    loggerBindings.set(logger, { ...currentBindings, ...bindings });
  };

  /**
   * ### Removes a previously added key/value pair from the JSON log
   *
   * If `addBinding()` was called with multiple key/values, then you will have to
   * remove each key/value with individual calls to `removeBinding()`.
   *
   * @param logger The logger that had the `addBinding()` call originally
   * @param key The key that you wish to remove
   */
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
   *
   * This function will first get the custom bindings for the bound logger (this).
   * Then it will inject any custom bindings into the 'mergedObject', which is a
   * param for the native/original log method.
   */
  function log(
    this: Logger,
    originalMethod: LogFn,
    objOrMsg?: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): void {
    const bindings = getBindings(this);

    const errorKeySym = symbols.errorKeySym;
    /* Since the pino log fn's are overloaded, i.e. can either have an obj or string
    as the first parameter, we have to figure out if the first parameter is an object... */
    const isObj = objOrMsg !== null && typeof objOrMsg === "object";
    if (isObj) {
      // We put an Error object on the "errorKey" so that we can also add any
      // custom bindings as well
      if (objOrMsg instanceof Error) {
        originalMethod(
          {
            // ! Weird way I've had to type the logger instance to access a symbol property...
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [(this as Record<any, any>)[errorKeySym as unknown as string]]:
              objOrMsg,
            ...bindings,
          },
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

  /**
   * This function is called with a base or child logger to override the
   * native/original log methods and child method such that we send all
   * logs through our `log()` function and child loggers are created with
   * our `customChild()` function.
   */
  function overrideMethods(logger: Logger) {
    // Keep references to the original (e.g. pino.LogFn) methods
    const originalMethods: OriginalMethods = {
      debug: logger.debug.bind(logger),
      info: logger.info.bind(logger),
      warn: logger.warn.bind(logger),
      error: logger.error.bind(logger),
      fatal: logger.fatal.bind(logger),
    };

    // Store the original methods for this logger. Helpful for testing (can spy on them)
    loggerOriginalMethods.set(logger, originalMethods);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.debug = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.debug, objOrMsg, ...args);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.info = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.info, objOrMsg, ...args);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.warn = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.warn, objOrMsg, ...args);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.error = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.error, objOrMsg, ...args);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger.fatal = (objOrMsg?: unknown, ...args: any[]) => {
      log.call(logger, originalMethods.fatal, objOrMsg, ...args);
    };

    // eslint-disable-next-line @typescript-eslint/ban-types
    logger.child = <ChildOptions extends pino.ChildLoggerOptions = {}>(
      bindings: pino.Bindings,
      options?: ChildOptions,
    ) => {
      /* The originalChild function is the stored original pino child function with our bound current logger */
      const originalChild = originalChildFunction.bind(logger);

      // -- DEBUG --
      // console.log(
      //   `The shadowed child() has been called on loggerId ${trackObject(
      //     logger,
      //   )} with:`,
      //   {
      //     bindings,
      //     options,
      //     loggerCurrentBindings: logger.bindings(),
      //   },
      // );

      /* The result of overriding the logger.child is that when it is called, we will actually call
      the customChild function with this logger bound, the bindings/options from a typical child() call, 
      and the original child function that has our current logger bound. */
      return customChild.call(
        logger,
        bindings,
        options,
        originalChild,
      ) as pino.Logger<LoggerOptions & ChildOptions>;
    };
  }

  /**
   * ### Creates a Pino child logger instance
   *
   * Any binding added through the child() will be nested under the `childNestedKey` key in order
   * to preserve ECS compatibility. In other words, we want to avoid our logger adding
   * root-level keys that could possibily conflict.
   */
  function customChild<ChildOptions extends pino.ChildLoggerOptions>(
    this: Logger,
    bindings: pino.Bindings,
    options: ChildOptions | undefined,
    originalChild: typeof baseLogger.child,
  ): pino.Logger<LoggerOptions & ChildOptions> {
    const newChildBindings: pino.Bindings = {};

    const childNestedKey = opts?.childNestedKey?.trim();

    Object.entries(bindings).forEach(([k, v]) => {
      const stringifiedValue = typeof v === "string" ? v : JSON.stringify(v); // The value is always a string

      // If using a childNestedKey, place the child bindings under this key
      if (childNestedKey) {
        if (restrictedLabels.includes(k)) {
          console.warn(
            `[loggerManager] Cannot use restricted key in child logger bindings. Ignoring key/value ({${k}: ${stringifiedValue}})`,
          );
        } else {
          if (!k.startsWith(childNestedKey)) {
            newChildBindings[`${childNestedKey}.${k}`] = stringifiedValue;
          }
        }
      } else {
        newChildBindings[k] = stringifiedValue;
      }
    });

    const childLogger = originalChild(newChildBindings, options);
    loggerBindings.set(childLogger, {
      ...getBindings(this),
      // ...bindings,
    });

    // Overriding log methods to incorporate our custom logic
    overrideMethods(childLogger);
    return childLogger;
  }

  // Overriding log methods to incorporate our custom logic
  overrideMethods(baseLogger);

  return {
    addBinding,
    removeBinding,
    getLogger,
    getOriginalMethods,
  };
};

const manager = loggerManager(
  getBaseLogger(config.node_env, {
    app: config.app_name,
    node_env: config.node_env,
  }),
  {
    childNestedKey: "labels",
    childRestrictedKeys: ["app", "node_env", "testName"],
  },
);
export const { addBinding, removeBinding, getLogger } = manager;
