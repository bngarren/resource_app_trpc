import { Prisma, SpawnRegion } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import {
  SpawnRegionWithResources,
  SpawnedResourceWithResource,
} from "../types";

/**
 * ### Gets the Spawn Region that owns/owned a SpawnedResource, by id
 * @param spawnedResourceId
 * @param prismaClient
 * @returns
 */
export const getSpawnRegionBySpawnedResourceId = async (
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

export const createSpawnRegion = async (
  model: Prisma.SpawnRegionCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegion> => {
  return await prismaClient.spawnRegion.create({
    data: model,
  });
};

export const createSpawnRegions = async (
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
 * Returns an array of SpawnRegions, given an array of h3 indices that represent these regions
 */
export const getSpawnRegionsFromH3Indices = async (
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
 * ### Returns a SpawnRegion based on the id.
 *
 * This function does **NOT** return the associated SpawnedResources. For that,
 * use `getSpawnRegionWithResources`
 *
 * @param id
 * @param prismaClient
 * @returns SpawnRegion
 */
export const getSpawnRegion = async (
  id: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.spawnRegion.findUniqueOrThrow({
    where: { id },
  });
};

/**
 * ### Returns a SpawnRegion based on the id and includes its associated resources.
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
export const getSpawnRegionWithResources = async (
  id: string,
  includeInactive = false,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<SpawnRegionWithResources> => {
  const spawnRegion = await prismaClient.spawnRegion.findUnique({
    where: { id },
    include: {
      SpawnedResources: {
        include: {
          resource: true,
        },
      },
    },
  });

  if (!spawnRegion) {
    throw new Error(`No spawn region found with id: ${id}`);
  }

  const resources: SpawnedResourceWithResource[] =
    spawnRegion.SpawnedResources.filter((spawnedResource) => {
      // Filter the SpawnedResources; defaults to including only active ones
      if (includeInactive) {
        return true;
      } else {
        return spawnedResource.isActive;
      }
    }).map((spawnedResource) => {
      // Add the Resource as a property to the SpawnedResource
      const { resource, ...rest } = spawnedResource;
      return {
        ...rest,
        resource: resource,
      };
    });

  const { SpawnedResources, ...restSpawnRegion } = spawnRegion;

  // Return the SpawnRegion along with SpawnedResourceWithResource[]
  return {
    ...restSpawnRegion,
    resources,
  } as SpawnRegionWithResources;
};

/**
 * Use this function to update a SpawnRegion in the database.
 *
 * E.g. We use it for updating the reset_date
 */
export const updateSpawnRegion = async (
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
