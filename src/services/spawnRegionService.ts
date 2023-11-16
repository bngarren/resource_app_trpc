import {
  prisma_createSpawnRegion,
  prisma_createSpawnRegions,
  prisma_getSpawnRegionBySpawnedResourceId,
  prisma_getSpawnRegionWithResources,
} from "../queries/querySpawnRegion";
import { Prisma } from "@prisma/client";
import { prisma_updateSpawnedResourcesForSpawnRegionTransaction } from "../queries/queryResource";
import { SpawnRegionWithSpawnedResources } from "../types";
import { logger } from "../main";
import config from "../config";

export const getSpawnRegionParentOfSpawnedResource = async (
  spawnedResourceId: string,
) => {
  return prisma_getSpawnRegionBySpawnedResourceId(spawnedResourceId);
};

export const handleCreateSpawnRegion = async (
  spawnRegionModel: Prisma.SpawnRegionCreateInput,
) => {
  return prisma_createSpawnRegion(spawnRegionModel);
};

export const handleCreateSpawnRegions = async (
  spawnRegionModels: Prisma.SpawnRegionCreateManyInput[],
) => {
  return prisma_createSpawnRegions(spawnRegionModels);
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
): Promise<SpawnRegionWithSpawnedResources | null> => {
  if (spawnRegionId === null) {
    console.error(`Couldn't find SpawnRegion (id=null) to update.`);
    return null;
  }

  try {
    // Get an updated SpawnRegion (only a partial because it does not include all the Resource models)
    const _updatedSpawnRegion =
      await prisma_updateSpawnedResourcesForSpawnRegionTransaction(
        spawnRegionId,
      );

    // Re-query to get all the resources included
    const updatedSpawnRegion = await prisma_getSpawnRegionWithResources(
      _updatedSpawnRegion.id,
    );

    return updatedSpawnRegion;
  } catch (err) {
    logger.error(
      { [config.logger_error_key]: err, spawnRegionId },
      `During spawnRegionService's updateSpawnRegion(), returning NULL`,
    );
    // Transaction did not go through
    return null;
  }
};
