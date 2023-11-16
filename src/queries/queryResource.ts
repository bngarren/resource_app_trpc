import {
  ResourceWithRarity,
  SpawnRegionWithSpawnedResourcesPartial,
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
  prisma_getSpawnRegionWithResources,
  prisma_updateSpawnRegion,
} from "./querySpawnRegion";
import { prefixedError } from "../util/prefixedError";

/**
 * ### Creates a new Resource
 */
export const prisma_createResource = async (
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
export const prisma_createResources = async (
  models: Prisma.ResourceCreateManyInput[],
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.resource.createMany({
    data: models,
    skipDuplicates: true,
  });
};

/**
 * ### Creates a new SpawnedResource
 * (This is a resource associated with an actual SpawnRegion and at a specific h3 index)
 */
export const prisma_createSpawnedResource = async (
  model: Prisma.SpawnedResourceCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnedResource> => {
  return prismaClient.spawnedResource.create({
    data: model,
  });
};

/**
 * ### Gets a Resource, by id (primary key).
 *
 * This returns a `Resource` type/model only. This _does not_ return a SpawnedResource.
 *
 * If you need the `ResourceRarity` data, use **`prisma_getResourceByIdWithRarity()`**
 *
 * **Throws** error if Resource is not found.
 */
export const prisma_getResourceById = async (
  resourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<Resource> => {
  return prismaClient.resource.findUniqueOrThrow({
    where: { id: resourceId },
  });
};

/**
 * ### Gets a Resource, by id (primary key), with ResourceRarity.
 *
 * This returns a `ResourceWithRarity` type which is a `Resource` with its
 * associated rarity data. This _does not_ return a SpawnedResource.
 *
 * If you only need the `Resource` type, use **`prisma_getResourceById()`**
 *
 * **Throws** error if Resource is not found.
 */
export const prisma_getResourceByIdWithRarity = async (
  resourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<ResourceWithRarity> => {
  return prismaClient.resource.findUniqueOrThrow({
    where: { id: resourceId },
    include: {
      resourceRarity: true,
    },
  });
};

/**
 * ### Gets a Resource, by url
 *
 * This returns a `Resource` type only. This _does not_ return a SpawnedResource.
 *
 * If you need the `ResourceWithRarity` type, use **`prisma_getResourceByUrlWithRarity()`**
 *
 * **Throws** error if Resource is not found.
 */
export const prisma_getResourceByUrl = async (
  resourceUrl: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.resource.findUniqueOrThrow({
    where: { url: resourceUrl },
  });
};

/**
 * ### Gets a Resource, by url, with ResourceRarity
 *
 * This returns a `ResourceWithRarity` type which is a `Resource` with its
 * associated rarity data. This _does not_ return a SpawnedResource.
 *
 * If you only need the `Resource` type, use **`prisma_getResourceByUrl()`**
 *
 * **Throws** error if Resource is not found.
 */
export const prisma_getResourceByUrlWithRarity = async (
  resourceUrl: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.resource.findUniqueOrThrow({
    where: { url: resourceUrl },
    include: {
      resourceRarity: true,
    },
  });
};

/**
 * ### Gets all Resources
 * This is strictly the Resource models (not SpawnedResource or variants)
 *
 * We include a join on the **`ResourceRarity`** table.
 *
 * E.g. can used when creating random resources (thus needs info on rarity, likelihood, etc.)
 *
 */
export const prisma_getResources = async (
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.resource.findMany({
    include: {
      resourceRarity: true,
    },
  });
};

/**
 * ### Gets all Resources, by the id's (primary keys)
 */
export const prisma_getResourcesByIds = async (
  resourceIds: string[],
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.resource.findMany({
    where: {
      id: {
        in: resourceIds,
      },
    },
  });
};

/**
 * ### Gets a SpawnedResource, by id (primary key).
 *
 * This returns a `SpawnedResource` type/model only. This _does not_ include the associated Resource.
 *
 * If you need the `Resource` data, use **`prisma_getSpawnedResourceByIdWithResource()`**
 *
 * **Throws** error if SpawnedResource is not found.
 */
export const prisma_getSpawnedResourceById = async (
  spawnedResourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.spawnedResource.findUniqueOrThrow({
    where: { id: spawnedResourceId },
  });
};

/**
 * ### Gets a SpawnedResource, by id (primary key), with Resource.
 *
 * This returns a `SpawnedResourceWithResource` type which is a `SpawnedResource` with its
 * associated resource data.
 *
 * If you only need the `SpawnedResource` model, use **`prisma_getSpawnedResourceById()`**
 *
 * **Throws** error if SpawnedResource is not found.
 */
export const prisma_getSpawnedResourceByIdWithResource = async (
  spawnedResourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnedResourceWithResource> => {
  return prismaClient.spawnedResource.findUniqueOrThrow({
    where: { id: spawnedResourceId },
    include: {
      resource: true,
    },
  });
};

/**
 * ### Gets the SpawnedResources associated with a given SpawnRegion
 * Each SpawnedResource is the type `SpawnedResourceWithResource`
 *
 * Defaults to only include **_active_** SpawnedResources
 *
 * Use the helper function from resourceService `pruneSpawnedResourceWithResource`
 * to get _only_ the SpawnedResources, or instead call `prisma_getSpawnedResourcesForSpawnRegion()`
 *
 */
export const prisma_getSpawnedResourcesWithResourceForSpawnRegion = async (
  spawnRegionId: string,
  includeInactive = false,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.spawnedResource.findMany({
    where: {
      spawnRegionId: spawnRegionId,
      ...(!includeInactive && { isActive: true }), // conditionally filter if includeActive is false (default)
    },
    include: {
      resource: true,
    },
  });
};

/**
 * ### Gets the SpawnedResources associated with a given SpawnRegion
 *
 * Defaults to include only **_active_** SpawnedResources
 *
 * This only returns `SpawnedResource[]`, not the extended `SpawnedResourceWithResource[]` type.
 * For that, instead use `prisma_getSpawnedResourcesWithResourceForSpawnRegion()`
 *
 */
export const prisma_getSpawnedResourcesForSpawnRegion = async (
  spawnRegionId: string,
  includeInactive = false,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.spawnedResource.findMany({
    where: {
      spawnRegionId: spawnRegionId,
      ...(!includeInactive && { isActive: true }),
    },
  });
};

/**
 * ### Updates multiple SpawnedResources
 * - The same `partialModel` will be used to update all SpawnedResources with the same data
 * - E.g., update all `isActive` to false
 */
export const prisma_updateSpawnedResources = async (
  spawnedResourceIds: string[],
  partialModel: Prisma.SpawnedResourceUpdateManyMutationInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.spawnedResource.updateMany({
    where: {
      id: {
        in: spawnedResourceIds,
      },
    },
    data: partialModel,
  });
};

/**
 * This function creates/updates the spawned resources for a given spawn region.
 * It checks whether the SpawnRegion is stale and if so, deletes old/previous
 * SpawnedResources and populates new ones. It also updates spawn region's
 * resetDate to be current time + reset interval and returns the updated SpawnRegion.
 *
 * The `forcedSpawnedResourceModels` param is used for testing purposes. It allows an
 * array of pre-made SpawnedResource models to be passed in and used instead of the
 * random generation that this function will normally use.
 * - If it is passed in as empty [], no spawned resources will be created.
 *
 * @param forcedSpawnedResourceModels - used for TESTING
 * @returns SpawnRegionWithResourcesPartial (this means the full Resource
 * model is not returned for each resource, only SpawnedResource)
 */
export const prisma_updateSpawnedResourcesForSpawnRegionTransaction = async (
  spawnRegionId: string,
  forcedSpawnedResourceModels?: Prisma.SpawnedResourceCreateInput[],
) => {
  if (spawnRegionId === null) {
    throw new Error(
      `Could not update spawned resources for SpawnRegion with NULL id`,
    );
  }

  // Only allow use of forced spawned resources in test or development env
  const allowedEnv: NodeEnvironment[] = ["test", "development"];
  if (
    forcedSpawnedResourceModels != null &&
    !allowedEnv.includes(config.node_env)
  ) {
    throw new Error(
      `Cannot use forcedSpawnedResourceModels while in '${config.node_env}' environment`,
    );
  }

  // Get the spawn region and its active (prior to function call) resources
  let priorResources: SpawnedResource[];
  let spawnRegion: SpawnRegion;
  try {
    const res = await prisma_getSpawnRegionWithResources(spawnRegionId);
    const { spawnedResources: _priorResources, ...rest } = res;
    priorResources = _priorResources.map((pr) =>
      pruneSpawnedResourceWithResource(pr),
    );
    spawnRegion = rest;
  } catch (error) {
    throw prefixedError(
      error,
      "attemping to get the spawn region and its active resources",
    );
  }

  /* If a SpawnRegion's `reset_date` is stale/overdue, then repopulate a fresh
      set of spawned resources.

      Or, if forcedSpawnedResourceModels has been passed, continue, using this data
      */
  if (
    priorResources.length === 0 ||
    isSpawnRegionStale(spawnRegion) ||
    forcedSpawnedResourceModels != null
  ) {
    // We do some things outside of the transaction to limit time in the transaction
    // i.e. these things may make database queries but don't mutate (nothing to roll back)

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
        throw prefixedError(
          err,
          "attempting to make new spawned resource models",
        );
      }
    }

    let trxResult: SpawnRegionWithSpawnedResourcesPartial;

    try {
      trxResult = await prisma.$transaction(async (trx) => {
        // * - - - - - - - START TRANSACTION - - - - - - - -

        // logger.debug(`SpawnRegion ${spawnRegion.id} is stale`);

        /* We do not delete stale SpawnedResources (as done previously) as they may still 
        be used as a foreign key in other tables, e.g. HarvestOperations that have not ended
        even though the SpawnedResource is stale.

        Instead, we flag the SpawnedResource isActive as false.
        */

        // Set each spawned resource to isActive=false
        await prisma_updateSpawnedResources(
          priorResources.map((r) => r.id),
          { isActive: false },
          trx,
        );

        // !deprecated
        /* const res_1 = await deleteSpawnedResourcesForSpawnRegion(
          spawnRegion.id,
          trx,
        ); */

        // Use Promise.allSettled so that we throw an error and exit transaction if any one fails

        const allSettledResult = await Promise.allSettled(
          spawnedResourceModels.map((model) =>
            prisma_createSpawnedResource(model, trx),
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
        const res_3 = await prisma_updateSpawnRegion(
          spawnRegion.id,
          newSpawnRegionData,
          trx,
        );

        if (!res_3) {
          throw new Error(
            `Modifying spawn region's (id=${spawnRegion.id}) resetDate failed`,
          );
        }

        /* The SpawnRegion WAS stale/overdue, so we updated the resources.
            Return the updated SpawnRegion        
          */
        const updatedSpawnRegion: SpawnRegionWithSpawnedResourcesPartial = {
          ...res_3,
          spawnedResources: newSpawnedResources,
        };
        return updatedSpawnRegion;
      });
    } catch (error) {
      // Any transaction query should be automatically rolled-back
      throw prefixedError(
        error,
        `updateSpawnedResourcesForSpawnRegionTransaction for spawnRegionId ${spawnRegionId}`,
      );
    }
    return trxResult;
  } else {
    /*
      The SpawnRegion was not stale/overdue, so we didn't change anything.
      Return a copy of the original
      */
    return {
      ...spawnRegion,
      spawnedResources: priorResources,
    } as SpawnRegionWithSpawnedResourcesPartial;
  }
};

/**
 * ### Deletes all SpawnedResources for a SpawnRegion, by id (primary key)
 */
export const prisma_deleteSpawnedResourcesForSpawnRegion = async (
  spawnRegionId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.spawnedResource.deleteMany({
    where: {
      spawnRegionId: spawnRegionId,
    },
  });
};
