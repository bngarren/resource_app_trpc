import pino from "pino";

export const logger = pino({
  // Min log level
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      colorizeObjects: true,
      translateTime: "SYS:mm/dd HH:MM:ss",
    },
  },
});
