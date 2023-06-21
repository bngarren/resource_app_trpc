/**
 * Instantiates a single instance PrismaClient and save it on the global object.
 * @link https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prismaGlobal = global as typeof global & {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  prismaGlobal.prisma ||
  new PrismaClient({
    // Specific the log levels for development versus production
    // options: query, warn, error
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

export type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.prisma = prisma;
}
