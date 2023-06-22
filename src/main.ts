import { publicProcedure, router } from "./trpc";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { z } from "zod";
import { createContext } from "./trpc";
import { handleScan } from "./services/scanService";
import { TRPCError } from "@trpc/server";
import config from "./config";
import { logger } from "./logger/logger";
import { logScanResult } from "./logger/loggerHelper";

const appRouter = router({
  greeting: publicProcedure.query(async () => {
    // TODO: Do some server health checks
    const isHealthy = true;
    logger.info(`Received greeting from client. API isHealthy: ${isHealthy}`);
    return {
      isHealthy: isHealthy,
    };
  }),
  scan: publicProcedure
    .input(
      // The latitude must be a number between -90 and 90 and the longitude between -180 and 180
      z.object({
        userLocation: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const res = await handleScan(input.userLocation, config.scan_distance);
        logScanResult(res);
        return res;
      } catch (err) {
        logger.error(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Problem with handleScan..." + err,
        });
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
