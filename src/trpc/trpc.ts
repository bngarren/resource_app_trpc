import { TRPCError, inferAsyncReturnType, initTRPC } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { logger } from "../logger/logger";
import { Request } from "express";
import { decodeAndVerifyJwtToken } from "../auth/firebaseAuth";
import config from "../config";

/**
 * ### Get's authenticated user from request header
 * This helper function reads the Request and using the authorization header,
 * it tries to extract a JWT token (which should be a valid Firebase ID token),
 * and if successful, returns the Firebase user
 *
 * @returns A UserRecord (Firebase type that includes uid, email, displayName, etc.), or undefined
 */
const getUserFromRequestHeader = async (req: Request) => {
  if (req.headers.authorization) {
    const user = await decodeAndVerifyJwtToken(
      req.headers.authorization.split(" ")[1],
    );
    return user;
  } else {
    logger.warn(`No authorization header with request.`);
  }
  return null;
};

/**
 * ### Context
 * Properties added to the context will be available for all middleware and procedures
 *
 * For example, can grab info from the request header and add it to context, e.g. hostname
 */
export const createContext = async (
  opts: trpcExpress.CreateExpressContextOptions,
) => {
  const client = opts.req.headers.host;

  // If null, we are not authenticated.
  const user = await getUserFromRequestHeader(opts.req);

  return {
    client,
    user,
  };
};
type Context = inferAsyncReturnType<typeof createContext>;

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;

// Logging middleware
const loggerMiddleware = middleware(async (opts) => {
  logger.info(
    { client: opts.ctx.client, type: opts.type, input: opts.rawInput },
    `Request received for /${opts.path}`,
  );

  return opts.next();
});

function createProtectedRouter() {
  return middleware(({ ctx, next }) => {
    if (!config.use_protected_routes) {
      logger.warn("Not using protectedRoutes for TRPC. Allowing request...");
    } else {
      // We are using protectedRoutes, so let's throw Error if unauthorized user...
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
    }
    return next({
      ctx: {
        ...ctx,
        // infers that `user` is non-nullable to downstream procedures
        user: ctx.user,
      },
    });
  });
}

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure.use(loggerMiddleware);
export const protectedProcedure = publicProcedure.use(createProtectedRouter());