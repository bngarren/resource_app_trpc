import * as dotenv from "dotenv";
import path from "path";

export type NodeEnvironment = "development" | "test" | "staging" | "production";

// this process.env is from the environment that the node process was launched
const node_env =
  (process.env.NODE_ENV?.toLocaleLowerCase() as NodeEnvironment) ||
  "development";

// Next we use dotenv to load an .env file and override any prior env variables

// To use the .env file, we use the dotenv module to load the values
// Have to give the dotenv config the relative path to .env for it to work properly

/*
Note: Any variables defined in your environment at runtime will always override
anything loaded by dotenv from the .env file. So if you have different values
in your .env file and in your Docker environment, the Docker environment value will be used.
*/

// First, load the common .env file
dotenv.config({
  path: path.resolve(__dirname, `../../.env.common`),
});

// The load the environment-specific file
dotenv.config({
  path: path.resolve(__dirname, `../../.env.${node_env}`),
});

const firebase_service_acct_key: string | undefined =
  process.env.FIREBASE_SERVICE_ACCT_KEY;

if (!firebase_service_acct_key) {
  throw new Error("Missing Firebase Service Account Key.");
}

// Always use protected routes unless we are in development environment
// * Test environment requires protected routes to pass authentication tests
const shouldUseProtectedRoutes = node_env !== "development";

// Plan to always use a HTTPS server. However, if deployed to Heroku, it will automatically
// do this, so we just create a HTTP server in code and let Heroku do the rest.
// We look for the env variable IS_REMOTE_HOST from Heroku to determine this
const shouldCreateHTTPSServer = process.env.IS_REMOTE_HOST !== "true" ?? true;

export default {
  server_port: parseInt(process.env.PORT as string, 10) || 443, // default HTTPS port
  shouldCreateHTTPSServer: shouldCreateHTTPSServer,
  node_env: node_env,
  log_level: process.env.LOG_LEVEL ?? "info",
  use_protected_routes: shouldUseProtectedRoutes,
  firebase_service_acct_key: firebase_service_acct_key,
  firebase_test_user_uid: process.env.FIREBASE_TEST_USER_UID,
  firebase_client_config: process.env.FIREBASE_CLIENT_CONFIG ?? "",
  //
  //
  // App
  app_name: "arcane_prospector",
  min_resources_per_spawn_region: 1,
  max_resources_per_spawn_region: 3,
  spawn_region_h3_resolution: 9,
  spawn_region_reset_interval: 3, // days
  scan_distance: 2,
  resource_h3_resolution: 11, // the size of the resource h3 cells
  harvest_h3_resolution: 10, // the size of the scan/harvest h3 cells

  user_interact_distance: 250, // meters

  base_units_per_minute_harvested: 5, // Base harvester extraction rate
  base_minutes_per_arcane_energy_unit: 60,
};
