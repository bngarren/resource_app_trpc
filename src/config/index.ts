import * as dotenv from "dotenv";
import path from "path";

// To use the .env file, we use the dotenv module to load the values
// Have to give the dotenv config the relative path to .env for it to work properly
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

type NodeEnvironment = "development" | "test" | "production";

const node_env = process.env.NODE_ENV as NodeEnvironment;

export default {
  server_port: parseInt(process.env.PORT as string, 10),
  node_env: node_env,
  //
  //
  // App
  min_resources_per_spawn_region: 1,
  max_resources_per_spawn_region: 3,
  spawn_region_h3_resolution: 9,
  spawn_region_reset_interval: 3, // days
  scan_distance: 2,
  resource_h3_resolution: 11, // the size of the resource h3 cells
  harvest_h3_resolution: 10, // the size of the scan/harvest h3 cells

  user_interact_distance: 250, // meters
};
