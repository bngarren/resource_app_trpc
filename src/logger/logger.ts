import fs from "fs";
import pino from "pino";
import config from "../config";
import path from "path";
import * as pretty from "pino-pretty";
import net from "net";
import { ecsFormat } from "@elastic/ecs-pino-format";

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
  const testLogPath = path.join(logDirectory, `app_test.log`);

  // Creates the directory if it doesn't exist.
  fs.mkdirSync(logDirectory, { recursive: true });

  // Stream where the logs will be written.
  const stream = fs.createWriteStream(testLogPath, {
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

  return pino(
    {
      ...ecsFormat(),
      level: "debug",
      sync: true,
    },
    stream,
  );
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

export const logger = getLogger().child({
  app: config.app_name,
  node_env: config.node_env,
});

function testLogstashConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000); // Timeout after 2 seconds

    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
  });
}
