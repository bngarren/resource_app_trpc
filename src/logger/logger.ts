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

const prodLogger = () =>
  pino({
    level: "info",
  });

const getLogger = () => {
  return shouldUseDevLogger ? devLogger() : prodLogger();
};

export const logger = getLogger();
