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
  resources_per_region: 3,
  resource_h3_resolution: 12,
  region_h3_resolution: 8,
  region_reset_interval: 3, //days
  scan_distance: 1,
  user_interact_distance: 100, // meters
};
