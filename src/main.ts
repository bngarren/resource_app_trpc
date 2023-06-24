import { publicProcedure, router as trpcRouter } from "./trpc";
import express from "express";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import { z } from "zod";
import { createContext } from "./trpc";
import { handleScan } from "./services/scanService";
import { TRPCError } from "@trpc/server";
import config from "./config";
import { logger } from "./logger/logger";
import { logScanResult } from "./logger/loggerHelper";
import { prisma } from "./prisma";

const appRouter = trpcRouter({
  greeting: publicProcedure.query(async () => {
    let isHealthy: boolean;

    try {
      await prisma.user.findFirst();
      // If the above statement did not throw an error, the database is healthy
      isHealthy = true;
    } catch (error) {
      // If an error was thrown, the database is not healthy
      isHealthy = false;
      logger.error(`Database connection failed: ${error}`);
    }

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

const message = `






Resource App
    Server v${process.env.npm_package_version} 
--------------------------------------------------------------------------------------

    Running on port: ${config.server_port}
    Log level: "${logger.level.toUpperCase()}" [${Object.keys(
  logger.levels.values,
)}]
    NODE_ENV: "${config.node_env}"



`;

const app = express();
app.use(cors());
app.use(
  "/",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);
app.get("/", (_req, res) => res.send("hello"));

async function main() {
  const startTime = new Date();

  app.listen(config.server_port, () => {
    logger.info(message);
    logger.info(
      `Server start: ${startTime.toLocaleDateString()} at ${startTime.toLocaleTimeString()}`,
    );
  });
}

// Only call main() if this module is being executed directly
if (require.main === module) {
  void main();
}

export default app;
