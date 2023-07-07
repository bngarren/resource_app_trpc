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
 * We turn off logs for test env since our tests will frequently (and purposefully)
 * throw errors.
 */
const getPrismaLogLevel = (): Prisma.LogLevel[] => {
  switch (config.node_env) {
    case "development":
      return ["info", "warn", "error"];
    case "test":
      return [];
    case "staging":
      return ["info", "warn", "error"];
    case "production":
      return ["error"];
  }
};

export const prisma: PrismaClient =
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
