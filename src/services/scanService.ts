import * as h3 from "h3-js";
import { getAllSettled } from "../util/getAllSettled";
import {
  updateSpawnRegion,
  handleCreateSpawnRegions,
} from "./spawnRegionService";
import {
  Coordinate,
  InteractableResource,
  LatLngTuple,
  SpawnRegionWithResources,
  ScanResult,
} from "../types";
import config from "../config";
import { v4 as uuid } from "uuid";
import { logger } from "../logger/logger";
import { getDistanceBetweenCells } from "../util/getDistanceBetweenCells";
import { getSpawnRegionsAround } from "../util/getSpawnRegionsAround";

export const handleScan = async (
  fromLocation: Coordinate,
  scanDistance = 1,
): Promise<ScanResult> => {
  /**
   * Scan location latitude
   */
  const latitude = fromLocation.latitude;
  /**
   * Scan location longitude
   */
  const longitude = fromLocation.longitude;

  /**
   * The h3 index of a spawn region, centered on the scan location
   */
  const h3Index = h3.latLngToCell(
    latitude,
    longitude,
    config.spawn_region_h3_resolution,
  );

  // Finds the h3 indices around the center scan region and any existing SpawnRegions associated with these.
  //
  // h3Group - all the h3 indices, including the center, that were 'scanned' at a distance of `config.scan_distance`
  // existingSpawnRegions - the spawnRegions that exist in the database associated with the h3 indices in h3Group
  const { h3Group, spawnRegions: existingSpawnRegions } =
    await getSpawnRegionsAround(h3Index, config.scan_distance);

  // Missing regions - not present in the database
  // i.e., An array of h3Indexes that need to be added to db
  const missingRegionsIndexes = h3Group.filter(
    (h) => !existingSpawnRegions.some((r) => r.h3Index === h),
  );

  if (missingRegionsIndexes.length !== 0) {
    logger.debug(
      `Need to create new SpawnRegions (${missingRegionsIndexes.length}): ${missingRegionsIndexes}`,
    );
  }

  // - - - - - - Create these SpawnRegions in the database - - - - -
  const regionModels = missingRegionsIndexes.map((m) => {
    return {
      h3Index: m,
      h3Resolution: config.spawn_region_h3_resolution,
    };
  });
  const newSpawnRegions = await handleCreateSpawnRegions(regionModels);

  const spawnRegions = [...existingSpawnRegions, ...newSpawnRegions];

  // the number of h3 indexes in the scan group should equal
  // the number of regions we now have (existing + newly created)
  if (spawnRegions.length !== h3Group.length) {
    throw new Error(
      "Did not match h3 indices with SpawnRegions in the database",
    );
  }

  // * - - - - - Update each region - - - - -
  /**
   * A `SpawnRegionWithResource[]` array that contains the updated SpawnRegions
   */
  const updatedSpawnRegions = await getAllSettled<SpawnRegionWithResources>(
    spawnRegions.map((r) => updateSpawnRegion(r.id)),
  );

  /* Expect that every spawn region was sucessfully updated.
  If not, the errored regions would have returned null and not be present
  in the updatedSpawnRegions array, making the length incorrect
  */
  if (updatedSpawnRegions.length !== h3Group.length) {
    throw new Error("Error attempting to update spawn regions");
  }

  /**
   * The harvestRegion is an h3 cell of size `config.harvest_h3_resolution` which is the
   * basis for calculating which interactables the user can interact with and will
   * be the location of any placed equipment (i.e. harvesters).
   */
  const harvestRegion = h3.latLngToCell(
    latitude,
    longitude,
    config.harvest_h3_resolution,
  );

  /**
   * The group of h3 cells (indices) around the periphery of the harvest region (not including the center
   * which is the harvestRegion itself). These h3 cells are the same size (same resolution) as the harvestRegion.
   */
  const scanH3Group = h3
    .gridDisk(harvestRegion, 1)
    .filter((h) => h !== harvestRegion);

  /*
    Conversion of each resource within SpawnRegion to an InteractableResource.

    An InteractableResource type allows us to provide some metadata to the client, 
    along with the actual resource data. Metadata includes: location, distance to resource,
    userCanInteract boolean, etc.

  */

  /**
   * The actual 'resource' returned to the client in `InteractableResource` is the prisma type `Resource`.
   */
  const interactableResources = updatedSpawnRegions
    // For each SpawnRegion...
    .map((reg): InteractableResource[] => {
      // Loop through the SpawnRegions's spawned resources
      return reg.resources.map((r) => {
        const resourceLatLngCenter = h3.cellToLatLng(r.h3Index);

        /**
         * The distance of the resource from the center of the harvestRegion (i.e the scan region), in **meters**
         */
        const distanceFromHarvestRegionCenter = getDistanceBetweenCells(
          r.h3Index,
          harvestRegion,
        );

        const interactableResource: InteractableResource = {
          id: uuid(), // we are giving the client a random uuid for each interactable
          type: "resource",
          location: [resourceLatLngCenter[0], resourceLatLngCenter[1]],
          distanceFromHarvestRegionCenter: distanceFromHarvestRegionCenter, // m?
          userCanInteract: Boolean(
            distanceFromHarvestRegionCenter <= config.user_interact_distance,
          ),
          data: r.resource,
        };

        return interactableResource;
      });
    })
    .flat();

  const interactables = [...interactableResources];

  /* We provide a separate field in the ScanResult for a sorted array of interactables,
  based on distance from the scan region center.  
  */
  const sortedCanInteractableIds = interactables
    .filter((i) => i.userCanInteract === true)
    .sort((a, b) => {
      if (
        a.distanceFromHarvestRegionCenter <= b.distanceFromHarvestRegionCenter
      )
        return -1;
      else return 1;
    })
    .map((i) => {
      if (i.id) {
        return i.id;
      } else {
        throw Error("Interactable should have id before sending to client");
      }
    });

  const result: ScanResult = {
    metadata: {
      scannedLocation: [latitude, longitude],
    },
    scanPolygons: {
      centerPolygon: getH3Vertices(harvestRegion),
      peripheralPolygons: scanH3Group.map((pr) => getH3Vertices(pr)),
    },
    neighboringPolygons: h3
      .gridDisk(h3Index, scanDistance)
      .map((neighbor) => getH3Vertices(neighbor)),
    interactables: interactables,
    sortedCanInteractableIds: sortedCanInteractableIds,
  };

  return result;
};

function getH3Vertices(h3Index: string): LatLngTuple[] {
  return h3.cellToVertexes(h3Index).map((i) => {
    const latLng = h3.vertexToLatLng(i);
    return [latLng[0], latLng[1]];
  });
}
