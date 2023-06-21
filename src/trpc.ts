import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { logger } from "./logger/logger";

/**
 * Context
 */
export function createContext(_opts: CreateHTTPContextOptions) {
  const testCtx = {
    test: true,
  };
  return {
    testCtx,
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;

const loggerMiddleware = middleware(async (opts) => {
  logger.info({ path: opts.path, body: opts.rawInput }, "Received request");

  return opts.next();
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure.use(loggerMiddleware);
