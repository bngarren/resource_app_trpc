import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { logger } from "./logger/logger";

/**
 * ### Context
 * Properties added to the context will be available for all middleware and procedures
 *
 * For example, can grab info from the request header and add it to context, e.g. hostname
 */
export function createContext(opts: trpcExpress.CreateExpressContextOptions) {
  const client = opts.req.headers.host;
  return {
    client,
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
  logger.info(
    { client: opts.ctx.client, body: opts.rawInput },
    `Request received for /${opts.path}`,
  );

  return opts.next();
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure.use(loggerMiddleware);
