import { SpawnRegion } from "@prisma/client";
import * as h3 from "h3-js";
import { getSpawnRegionsFromH3Indices } from "../queries/querySpawnRegion";
import config from "../config";

/**
 * ### Returns the SpawnRegions within a distance around center h3 index
 * - If the given `centerH3Index` parameter is not the same h3 resolution of `spawn_region_h3_resolution`, this will convert
 * this index to the correct resolution.
 *   - E.g., if a h3 index representing a harvestRegion is given, it will convert this index's center coords to an
 * h3Index at the resolution of a spawnRegion--allowing one to find the spawn region's around a harvestRegion
 * - It first determines all the nearby h3 indices, including the center, and returns these
 * in `h3Group`
 * - It then queries the database for associated SpawnRegions and returns these in `spawnRegions`
 * @param centerH3Index - If the cell is not at the resolution of `spawn_region_h3_resolution`, will try to convert
 * this given h3Index to the appropriate resolution
 * @param distance - k-ring distance (from h3). Within our app, this is likely the `config.scan_distance`. I.e.,
 * we are interested in knowing the SpawnRegions around a scan region. Similiarly, when deploying a harvester,
 * we want to know the resources nearby a harvestRegion, so first we must identify the SpawnRegions to get their
 * SpawnedResource.
 * @returns
 * ```typescript
 * {
 * h3Group: string[],
 * spawnRegions: SpawnRegion[]
 * }
 * ```
 */
export const getSpawnRegionsAround = async (
  centerH3Index: string,
  distance: number,
) => {
  let resolvedH3Index;

  if (h3.getResolution(centerH3Index) === config.spawn_region_h3_resolution) {
    resolvedH3Index = centerH3Index;
  } else {
    // Convert the given h3Index to the correct resolution
    const latLng = h3.cellToLatLng(centerH3Index);
    resolvedH3Index = h3.latLngToCell(
      latLng[0],
      latLng[1],
      config.spawn_region_h3_resolution,
    );
  }

  /**
   * Array of h3 indices that represent all the SpawnRegions included in the scan
   */
  const h3Group = h3.gridDisk(resolvedH3Index, distance);

  // Query the database for existing SpawnRegions
  const spawnRegions: SpawnRegion[] = await getSpawnRegionsFromH3Indices(
    h3Group,
  );

  return { h3Group, spawnRegions };
};
