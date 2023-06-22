import pino from "pino";
import config from "../config";

export const logger = pino({
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
