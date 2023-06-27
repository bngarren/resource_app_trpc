import { protectedProcedure, publicProcedure, router } from "./trpc/trpc";
import express from "express";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import { createContext } from "./trpc/trpc";
import config from "./config";
import { logger } from "./logger/logger";
import { prisma } from "./prisma";
import https from "https";
import http, { Server } from "http";
import fs from "fs";
import { scanRouter } from "./routers/scanRouter";

const appRouter = router({
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
  protectedGreeting: protectedProcedure.query(async () => {
    return "You have received an authenticated endpoint!";
  }),
  scan: scanRouter.scan,
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
/*
- - - - Create the Express app and add our TRPC router - - - -

Our TRPC router is our main router for our server

*/
const app = express();
app.use(cors());
app.use(
  "/",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

/*
 - - - - Create the HTTPS server - - - - 

- In non-production (development, testing, staging), we will use a self-signed certificate and handle the
HTTPS server ourselves

- In a production (e.g. Heroku), we create a basic HTTP server, knowing that Heroku will handle the HTTPS and our
app will just listen on the port that Heroku provides
  - If we deployed production code to somewhere else, we need to know if HTTPS is automatically handled or if we need
  to get a signed cert from a trusted authority to use here...

*/
let server: Server;
if (process.env.NODE_ENV === "production") {
  // In production, rely on the platform (like Heroku) to handle HTTPS
  server = http.createServer(app);
} else {
  // In development, use a self-signed certificate for HTTPS
  const privateKey = fs.readFileSync("resource_app_trpc_https.key");
  const certificate = fs.readFileSync("resource_app_trpc_https.cert");
  const credentials = { key: privateKey, cert: certificate };
  server = https.createServer(credentials, app);
}

async function main() {
  const startTime = new Date();

  // The server_port in our config must distinguish our node environment
  // Usually HTTPS traffic is on 443
  server.listen(config.server_port, () => {
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
