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

  // Append timestamp to log filename.
  const testLogPath = path.join(logDirectory, `app_testing.log`);

  // Creates the directory if it doesn't exist.
  fs.mkdirSync(logDirectory, { recursive: true });

  // Stream where the logs will be written.
  const stream = fs.createWriteStream(testLogPath, {
    flags: "a", // 'a' means appending (old data will be preserved)
  });

  return pino(
    {
      level: config.log_level,
    },
    stream,
  );
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
    default:
      return prodLogger();
  }
};

export const logger = getLogger();
