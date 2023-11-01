import { Prisma, SpawnRegion } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import {
  SpawnRegionWithSpawnedResources,
  SpawnedResourceWithResource,
} from "../types";

/**
 * ### Creates a new SpawnRegion
 */
export const prisma_createSpawnRegion = async (
  model: Prisma.SpawnRegionCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegion> => {
  return await prismaClient.spawnRegion.create({
    data: model,
  });
};

/**
 * ### Creates multiple new SpawnRegions
 */
export const prisma_createSpawnRegions = async (
  models: Prisma.SpawnRegionCreateManyInput[],
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegion[]> => {
  await prismaClient.spawnRegion.createMany({
    data: models,
    skipDuplicates: true,
  });

  const h3Indices = models.map((m) => m.h3Index);

  return await prismaClient.spawnRegion.findMany({
    where: {
      h3Index: {
        in: h3Indices,
      },
    },
  });
};

/**
 * ### Gets the Spawn Region that owns/owned a SpawnedResource, by id
 * - A spawn region is still associated with an inactive SpawnedResource
 */
export const prisma_getSpawnRegionBySpawnedResourceId = async (
  spawnedResourceId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  const res = await prismaClient.spawnedResource.findUniqueOrThrow({
    where: {
      id: spawnedResourceId,
    },
    select: {
      spawnRegion: true,
    },
  });
  return res.spawnRegion;
};

/**
 * ### Returns an array of SpawnRegions, given an array of h3 indices that represent these regions
 * - An h3Index must be the correct resolution, i.e. `config.spawn_region_h3_resolution`.
 */
export const prisma_getSpawnRegionsFromH3Indices = async (
  h3Indices: string[],
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegion[]> => {
  const regions = await prismaClient.spawnRegion.findMany({
    where: {
      h3Index: {
        in: h3Indices,
      },
    },
  });

  return regions;
};

/**
 * ### Gets a SpawnRegion, by id (primary key).
 *
 * This function does **NOT** return the associated SpawnedResources. For that,
 * use `getSpawnRegionWithResources`
 */
export const prisma_getSpawnRegion = async (
  id: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.spawnRegion.findUniqueOrThrow({
    where: { id },
  });
};

/**
 * ### Gets a SpawnRegion, by id (primary key), and includes its associated resources.
 *
 * The `resources` property of the returned SpawnRegionWithResources is an array
 * of `SpawnedResourceWithResource`, which includes the SpawnedResource and
 * Resource models.
 *
 * Defaults to include *only* **active** spawned resources.
 *
 * #### Destructuring
 * The caller could destructure the result object in order to get a SpawnRegion
 * and SpawnedResourceWithResource[] separately.
 *
 * ```
 * { resources, ...rest } = getSpawnRegionWithResources()
 * const spawnRegion: SpawnRegion = rest
 * ```
 * ---
 *
 * @param id
 * @param includeInactive - Default is false. If true, will include inactive SpawnedResources that are associated
 * with this SpawnRegion
 * @param prismaClient
 * @returns SpawnRegionWithResources
 */
export const prisma_getSpawnRegionWithResources = async (
  id: string,
  includeInactive = false,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegionWithSpawnedResources> => {
  const spawnRegion = await prismaClient.spawnRegion.findUnique({
    where: { id },
    include: {
      spawnedResources: {
        include: {
          resource: true,
        },
      },
    },
  });

  if (!spawnRegion) {
    throw new Error(`No spawn region found with id: ${id}`);
  }

  const resources: SpawnedResourceWithResource[] = spawnRegion.spawnedResources
    .filter((spawnedResource) => {
      // Filter the SpawnedResources; defaults to including only active ones
      if (includeInactive) {
        return true;
      } else {
        return spawnedResource.isActive;
      }
    })
    .map((spawnedResource) => {
      // Add the Resource as a property to the SpawnedResource
      const { resource, ...rest } = spawnedResource;
      return {
        ...rest,
        resource: resource,
      };
    });

  const { spawnedResources, ...restSpawnRegion } = spawnRegion;

  // Return the SpawnRegion along with SpawnedResourceWithResource[]
  return {
    ...restSpawnRegion,
    spawnedResources: resources,
  } as SpawnRegionWithSpawnedResources;
};

/**
 * ### Updates a SpawnRegion, by id (primary key).
 *
 * E.g. For updating the reset_date
 */
export const prisma_updateSpawnRegion = async (
  id: string,
  partialModel: Prisma.SpawnRegionUpdateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.spawnRegion.update({
    where: {
      id: id,
    },
    data: {
      ...partialModel,
    },
  });
};
