import { middleware, publicProcedure, router } from "./trpc";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { z } from "zod";
import { createContext } from "./trpc";
import { handleScan } from "./services/scanService";
import { TRPCError } from "@trpc/server";
import config from "./config";

const loggerMiddleware = middleware(async (opts) => {
  const result = await opts.next();

  opts.rawInput && console.log(opts.rawInput);

  return result;
});

const loggedProcedure = publicProcedure.use(loggerMiddleware);

const appRouter = router({
  greeting: loggedProcedure
    .query(async () => {
      // TODO: Do some server health checks
      let isHealthy = true
      console.log(`Received greeting from client. API isHealthy: ${isHealthy}`)
      return {
        isHealthy: isHealthy
      }
    }),
  scan: loggedProcedure
    .input(
      // The latitude must be a number between -90 and 90 and the longitude between -180 and 180
      z.object({
        userLocation: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        }),
      })
    )
    .mutation(async ({ input }) => {
    
      try {
        const res = await handleScan(input.userLocation, config.scan_distance);
        console.log(res)
        return res
      } catch (err) {
        console.error(err)
        throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Problem with handleScan..." + err
        })
      }
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext,
}).listen(config.server_port);
