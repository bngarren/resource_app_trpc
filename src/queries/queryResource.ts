import {
  SpawnRegionWithResourcesPartial,
  SpawnedResourceWithResource,
} from "./../types/index";
import { Prisma, SpawnRegion, Resource, SpawnedResource } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import isSpawnRegionStale from "../util/isRegionStale";
import config from "../config";
import {
  generateSpawnedResourceModelsForSpawnRegion,
  pruneSpawnedResourceWithResource,
} from "../services/resourceService";
import { getAllSettled } from "../util/getAllSettled";
import {
  getSpawnRegionWithResources,
  updateSpawnRegion,
} from "./querySpawnRegion";

/**
- getResourceForSpawnedResourceInSpawnRegion
- getResourcesForSpawnRegion
- getSpawnedResourcesForSpawnRegion
- createResource
- createResources
- createSpawnedResource
- deleteSpawnedResourcesForSpawnRegion
- updateSpawnedResourcesForSpawnRegionTransaction

*/

/**
 * ### Gets a Resource, by id.
 * This is strictly the Resource schema (not SpawnedResource or variants)
 * @param resourceId
 * @param spawnRegionId
 * @param prismaClient
 * @returns
 */
export const getResource = async (
  resourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findUniqueOrThrow({
    where: { id: resourceId },
  });
};

/**
 * ### Gets the resources associated with a given SpawnRegion
 * Each resource is the type `SpawnedResourceWithResource`
 *
 * Use the helper function from resourceService `pruneSpawnedResourceWithResource`
 * to get only the SpawnedResources, or instead call `getSpawnedResourcesForSpawnRegion()`
 *
 */
export const getResourcesForSpawnRegion = async (
  spawnRegionId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  const res: SpawnedResourceWithResource[] =
    await prismaClient.spawnedResource.findMany({
      where: {
        spawnRegionId: spawnRegionId,
      },
      include: {
        resource: true,
      },
    });
  return res;
};

/**
 * ### Gets the SpawnedResources associated with a given SpawnRegion
 *
 * This only returns `SpawnedResource[]`, not the custom `SpawnedResourceWithResource[]` type.
 * For that, instead use `getResourcesForSpawnRegion()`
 *
 */
export const getSpawnedResourcesForSpawnRegion = async (
  spawnRegionId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.spawnedResource.findMany({
    where: {
      spawnRegionId: spawnRegionId,
    },
  });
};

/**
 * Creates a new Resource
 */
export const createResource = async (
  model: Prisma.ResourceCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<Resource> => {
  return await prismaClient.resource.create({
    data: model,
  });
};

/**
 * Creates multiple new Resources
 */
export const createResources = async (
  models: Prisma.ResourceCreateManyInput[],
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  await prismaClient.resource.createMany({
    data: models,
    skipDuplicates: true,
  });
};

/**
 * Creates a new SpawnedResource
 * (This is a resource associated with an actual SpawnRegion and at a specific h3 index)
 */
export const createSpawnedResource = async (
  model: Prisma.SpawnedResourceCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnedResource> => {
  return await prismaClient.spawnedResource.create({
    data: model,
  });
};

export const deleteSpawnedResourcesForSpawnRegion = async (
  spawnRegionId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.spawnedResource.deleteMany({
    where: {
      spawnRegionId: spawnRegionId,
    },
  });
};

export const updateSpawnedResourcesForSpawnRegionTransaction = async (
  spawnRegionId: string,
) => {
  if (spawnRegionId === null) {
    throw new Error(
      `Could not update spawned resources for SpawnRegion. Incorrect id (${spawnRegionId}) provided.`,
    );
  }

  let trxResult: SpawnRegionWithResourcesPartial;

  // Get the spawn region and its current (prior) resources
  const { resources: _priorResources, ...rest } =
    await getSpawnRegionWithResources(spawnRegionId);
  const priorResources = _priorResources.map((pr) =>
    pruneSpawnedResourceWithResource(pr),
  );
  const spawnRegion: SpawnRegion = rest;

  try {
    trxResult = await prisma.$transaction(async (trx) => {
      // * - - - - - - - START TRANSACTION - - - - - - - -

      /* If a SpawnRegion's `reset_date` is stale/overdue, then repopulate a fresh
      set of spawned resources.
      */

      if (priorResources.length === 0 || isSpawnRegionStale(spawnRegion)) {
        console.log(`SPAWN REGION ${spawnRegion.id} IS STALE`);

        /* Delete old/previous SpawnedResources for this SpawnRegion, if present. We
        do not delete any rows from the Resources table (these are just model resources)
        */
        const res_1 = await deleteSpawnedResourcesForSpawnRegion(
          spawnRegion.id,
          trx,
        );

        // safety check
        if (priorResources.length > 0 && res_1.count === 0) {
          throw new Error("Delete spawned resources failed");
        }

        // Populate new spawned resources
        const spawnedResourceModels =
          generateSpawnedResourceModelsForSpawnRegion(
            spawnRegion,
            [
              config.min_resources_per_spawn_region,
              config.max_resources_per_spawn_region,
            ],
            config.resource_h3_resolution,
          );

        const newSpawnedResources = await getAllSettled<SpawnedResource>(
          spawnedResourceModels.map((model) =>
            createSpawnedResource(model, trx),
          ),
        );

        // safety check
        if (newSpawnedResources.length !== spawnedResourceModels.length) {
          throw new Error("Populating spawned resources failed");
        }

        // Update spawn region's resetDate to be current time + reset interval
        const nextResetDate = new Date();
        nextResetDate.setDate(
          nextResetDate.getDate() + config.spawn_region_reset_interval,
        );

        const newSpawnRegionData = {
          resetDate: nextResetDate.toISOString(),
        };
        const res_3 = await updateSpawnRegion(
          spawnRegion.id,
          newSpawnRegionData,
          trx,
        );

        if (!res_3) {
          throw new Error("Modifying spawn region's resetDate failed");
        }

        // Finally, return the updated SpawnRegion
        const updatedSpawnRegion: SpawnRegionWithResourcesPartial = {
          ...res_3,
          resources: newSpawnedResources,
        };
        return updatedSpawnRegion;
      }
      /*
      The SpawnRegion was not stale/overdue, so we didn't change anything.
      Return a copy of the original
      */
      return {
        ...spawnRegion,
        resources: priorResources,
      } as SpawnRegionWithResourcesPartial;
    });
  } catch (error) {
    console.error(
      "Error within updateSpawnedResourcesForSpawnRegionTransaction" + error,
    );

    // Any transaction query should be automatically rolled-back
    throw error;
  }
  return trxResult;
};
