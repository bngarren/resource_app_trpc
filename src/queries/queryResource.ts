import { logger } from "./../logger/logger";
import {
  SpawnRegionWithResourcesPartial,
  SpawnedResourceWithResource,
} from "./../types/index";
import { Prisma, SpawnRegion, Resource, SpawnedResource } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import isSpawnRegionStale from "../util/isRegionStale";
import config, { NodeEnvironment } from "../config";
import {
  generateSpawnedResourceModelsForSpawnRegion,
  pruneSpawnedResourceWithResource,
} from "../services/resourceService";
import {
  getSpawnRegionWithResources,
  updateSpawnRegion,
} from "./querySpawnRegion";

/**
- getResource
- getAllResources
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
 * **Throws** error if Resource is not found.
 * This is strictly the Resource schema (not SpawnedResource or variants)
 * @param resourceId
 * @param spawnRegionId
 * @param prismaClient
 * @returns
 */
export const getResourceById = async (
  resourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findUniqueOrThrow({
    where: { id: resourceId },
  });
};

/**
 * ### Gets a Resource, by url
 * **Throws** error if Resource is not found.
 * This is strictly the Resource schema (not SpawnedResource or variants)
 * @param resourceUrl
 * @param prismaClient
 * @returns
 */
export const getResourceByUrl = async (
  resourceUrl: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findUniqueOrThrow({
    where: { url: resourceUrl },
  });
};

/**
 * ### Gets all Resources.
 * This is strictly the Resource schema (not SpawnedResource or variants)
 *
 * We include a join on the ResourceRarity table as this function is used when
 * creating random resources (thus needs info on rarity, likelihood, etc.)
 *
 * @param prismaClient
 * @returns
 */
export const getResources = async (
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findMany({
    include: {
      resourceRarity: true,
    },
  });
};

/**
 * ### Gets all Resources, by the provided Ids
 * @param resourceIds
 * @param prismaClient
 * @returns
 */
export const getResourcesByIds = async (
  resourceIds: string[],
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findMany({
    where: {
      id: {
        in: resourceIds,
      },
    },
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
 * ### Gets a SpawnedResource, by id.
 * **Throws** error if Resource is not found.
 */
export const getSpawnedResourceById = async (
  spawnedResourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.resource.findUniqueOrThrow({
    where: { id: spawnedResourceId },
  });
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
 * ### Creates a new Resource
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
 * ### Creates multiple new Resources
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
 * ### Creates a new SpawnedResource
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

/**
 * This function updates the spawned resources for a given spawn region.
 * It checks whether the SpawnRegion is stale and if so, deletes old/previous
 * SpawnedResources and populates new ones. It also updates spawn region's
 * resetDate to be current time + reset interval and returns the updated SpawnRegion.
 * @param spawnRegionId
 * @returns SpawnRegionWithResourcesPartial (this means the full Resource
 * model is not returned for each resource, only SpawnedResource)
 */
export const updateSpawnedResourcesForSpawnRegionTransaction = async (
  spawnRegionId: string,
  forcedSpawnedResourceModels?: Prisma.SpawnedResourceCreateInput[],
) => {
  if (spawnRegionId === null) {
    throw new Error(
      `Could not update spawned resources for SpawnRegion with NULL id`,
    );
  }

  // ! DEBUG/TESTING
  const allowedEnv: NodeEnvironment[] = ["test", "development"];
  if (
    forcedSpawnedResourceModels != null &&
    !allowedEnv.includes(config.node_env)
  ) {
    throw new Error(
      `Cannot use forcedSpawnedResourceModels while in ${config.node_env} environment`,
    );
  }

  // Get the spawn region and its current (prior) resources
  const { resources: _priorResources, ...rest } =
    await getSpawnRegionWithResources(spawnRegionId);
  const priorResources = _priorResources.map((pr) =>
    pruneSpawnedResourceWithResource(pr),
  );
  const spawnRegion: SpawnRegion = rest;

  /* If a SpawnRegion's `reset_date` is stale/overdue, then repopulate a fresh
      set of spawned resources.
      */
  if (
    priorResources.length === 0 ||
    isSpawnRegionStale(spawnRegion) ||
    forcedSpawnedResourceModels != null
  ) {
    // We do some things outside of the transaction to limit time in the transaction
    // * i.e. these things may make database queries but don't mutate (nothing to roll back)

    // Make some new spawned resource models
    let spawnedResourceModels: Prisma.SpawnedResourceCreateInput[];

    if (forcedSpawnedResourceModels != null) {
      spawnedResourceModels = [...forcedSpawnedResourceModels];
    } else {
      try {
        spawnedResourceModels =
          await generateSpawnedResourceModelsForSpawnRegion(
            spawnRegion,
            [
              config.min_resources_per_spawn_region,
              config.max_resources_per_spawn_region,
            ],
            config.resource_h3_resolution,
          );
        if (spawnedResourceModels.length === 0) {
          throw new Error("Unexpected error, 0 spawnedResourceModels returned");
        }
      } catch (err) {
        throw err;
      }
    }

    let trxResult: SpawnRegionWithResourcesPartial;

    try {
      trxResult = await prisma.$transaction(async (trx) => {
        // * - - - - - - - START TRANSACTION - - - - - - - -

        logger.debug(`SpawnRegion ${spawnRegion.id} is stale`);

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

        const allSettledResult = await Promise.allSettled(
          spawnedResourceModels.map((model) =>
            createSpawnedResource(model, trx),
          ),
        );

        const rejected = allSettledResult.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult;

        if (rejected) {
          throw new Error(
            `Problem within createSpawnedResource, reason: ${rejected.reason}`,
          );
        }

        const newSpawnedResources = allSettledResult.map(
          (result) => (result as PromiseFulfilledResult<SpawnedResource>).value,
        );

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

        /* The SpawnRegion WAS stale/overdue, so we updated the resources.
            Return the updated SpawnRegion        
          */
        const updatedSpawnRegion: SpawnRegionWithResourcesPartial = {
          ...res_3,
          resources: newSpawnedResources,
        };
        return updatedSpawnRegion;
      });
    } catch (error) {
      logger.error(
        error,
        "Error within updateSpawnedResourcesForSpawnRegionTransaction",
      );

      // Any transaction query should be automatically rolled-back
      throw error;
    }
    return trxResult;
  } else {
    /*
      The SpawnRegion was not stale/overdue, so we didn't change anything.
      Return a copy of the original
      */
    return {
      ...spawnRegion,
      resources: priorResources,
    } as SpawnRegionWithResourcesPartial;
  }
};
