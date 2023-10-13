/**
 * Instantiates a single instance PrismaClient and save it on the global object.
 * @link https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
 */
import { Prisma, PrismaClient } from "@prisma/client";
import config from "./config";

const prismaGlobal = global as typeof global & {
  prisma?: PrismaClient;
};

/**
 * We vary the logging level of the prisma client based on our current
 * environment.
 *
 * For "test" environment, we don't log to stdout, but instead emit events
 */
const getPrismaLogLevel = (): Array<Prisma.LogLevel | Prisma.LogDefinition> => {
  switch (config.node_env) {
    case "development":
      return ["info", "warn", "error"];
    case "test":
      // Emit a `query` event that can be listened to
      // see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/logging#event-based-logging
      return [{ emit: "event", level: "query" }];
    case "staging":
      return ["info", "warn", "error"];
    case "production":
      return ["error"];
  }
};

export const prisma: PrismaClient<
  Prisma.PrismaClientOptions,
  "query" | "info" | "warn" | "error"
> =
  prismaGlobal.prisma ||
  new PrismaClient({
    // Specific the log levels for development versus production
    // options: query, info, warn, error
    log: getPrismaLogLevel(),
  });

export type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.prisma = prisma;
}
