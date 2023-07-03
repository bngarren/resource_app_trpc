import fs from "fs";
import pino from "pino";
import config from "../config";
import path from "path";

const devLogger = () =>
  pino({
    // Min log level
    level: config.log_level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        colorizeObjects: true,
        translateTime: "SYS:mm/dd HH:MM:ss",
      },
    },
    formatters: {
      bindings: () => Object,
    },
  });

/**
 * For testLogger, we will log to a specific file in the /logs directory.
 */
const testLogger = () => {
  const logDirectory = path.join(process.cwd(), "/logs"); // This points to the project root /logs
  const testLogPath = path.join(logDirectory, `app_testing.log`);

  // Creates the directory if it doesn't exist.
  fs.mkdirSync(logDirectory, { recursive: true });

  // Stream where the logs will be written.
  const stream = fs.createWriteStream(testLogPath, {
    flags: "a", // 'a' means appending (old data will be preserved)
  });

  const logger = pino(
    {
      level: config.log_level,
      sync: true,
    },
    stream,
  );

  logger.info(`Started testLogger, writing to ${testLogPath}`);

  return logger;
};

const stagingLogger = () => {
  // Staging is built into /dist directory and run from there
  const logDirectory = path.join(process.cwd(), "/logs"); // This points to the project root /logs
  const stagingLogPath = path.join(logDirectory, `app_staging.log`);

  // Creates the directory if it doesn't exist.
  fs.mkdirSync(logDirectory, { recursive: true });

  // Stream where the logs will be written.
  const stream = fs.createWriteStream(stagingLogPath, {
    flags: "a", // 'a' means appending (old data will be preserved)
  });

  console.log(`Started stagingLogger, writing to ${stagingLogPath}`);

  const logger = pino(
    {
      level: config.log_level,
    },
    stream,
  );

  logger.info(`Started stagingLogger, writing to ${stagingLogPath}`);

  return logger;
};

const prodLogger = () =>
  pino({
    level: "info",
  });

const getLogger = () => {
  switch (config.node_env) {
    case "development":
      return devLogger();
    case "test":
      return testLogger();
    case "staging":
      return stagingLogger();
    default:
      return prodLogger();
  }
};

export const logger = getLogger();
