import {
  createSpawnRegion,
  createSpawnRegions,
  getSpawnRegionWithResources,
} from "../queries/querySpawnRegion";
import { Prisma } from "@prisma/client";
import { updateSpawnedResourcesForSpawnRegionTransaction } from "../queries/queryResource";
import { SpawnRegionWithResources } from "../types";

export { getSpawnRegionsFromH3Indices as getRegionsFromH3Array } from "../queries/querySpawnRegion";

export const handleCreateSpawnRegion = async (
  spawnRegionModel: Prisma.SpawnRegionCreateInput,
) => {
  return await createSpawnRegion(spawnRegionModel);
};

export const handleCreateSpawnRegions = async (
  spawnRegionModels: Prisma.SpawnRegionCreateManyInput[],
) => {
  return await createSpawnRegions(spawnRegionModels);
};

/**
 * ### Runs an update on a SpawnRegion, i.e. refreshes resources
 *
 * The goal of this function is to check a SpawnRegion's reset_date and then
 * update its spawned resources if necessary (if reset_date is stale/overdue).
 *
 * Doing this requires deleting prior spawned resources and adding new ones. This is all
 * performed within a Prisma transaction (within `updateSpawnedResourcesForSpawnRegionTransaction()`)
 * to ensure atomic changes, and rollbacks, if needed.
 *
 * The result that is returned from this function is a `SpawnRegionWithResources`
 *
 * @param spawnRegionId
 */
export const updateSpawnRegion = async (
  spawnRegionId: string,
): Promise<SpawnRegionWithResources | null> => {
  if (spawnRegionId === null) {
    console.error(`Couldn't find SpawnRegion (id=${spawnRegionId}) to update.`);
    return null;
  }

  try {
    // Get an updated SpawnRegion (only a partial because it does not include all the Resource models)
    const _updatedSpawnRegion =
      await updateSpawnedResourcesForSpawnRegionTransaction(spawnRegionId);

    // Re-query to get all the resources included
    const updatedSpawnRegion = await getSpawnRegionWithResources(
      _updatedSpawnRegion.id,
    );

    return updatedSpawnRegion;
  } catch (err) {
    // Transaction did not go through
    return null;
  }
};
