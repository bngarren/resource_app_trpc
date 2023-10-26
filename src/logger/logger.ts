import fs from "fs";
import pino from "pino";
import config from "../config";
import path from "path";
// import * as pretty from "pino-pretty";

let pretty: any;

if (["development", "testing"].includes(config.node_env)) {
  pretty = import("pino-pretty").then((module) => module);
}

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
  const writeStream = fs.createWriteStream(testLogPath, {
    flags: "a", // 'a' means appending (old data will be preserved)
  });

  const prettyStream = pretty.default({
    destination: testLogPath,
    translateTime: "SYS:mm/dd HH:MM:ss Z",
    append: true,
    colorize: true,
    colorizeObjects: true,
    ignore: "hostname,pid",
  });

  const logger = pino(
    {
      level: "debug", // previously, config.log_level,
      sync: true,
    },
    prettyStream,
  );

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

  const logger = pino(
    {
      level: config.log_level,
    },
    stream,
  );

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
