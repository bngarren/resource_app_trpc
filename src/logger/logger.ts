import pino from "pino";
import config from "../config";

const shouldUseDevLogger = ["development", "test"].includes(config.node_env);

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

const testLogger = () =>
  pino({
    enabled: false,
  });

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
