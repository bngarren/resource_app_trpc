import { Prisma, SpawnRegion } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import {
  SpawnRegionWithResources,
  SpawnedResourceWithResource,
} from "../types";

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
 * ---
 * The caller should destructure the result object in order to get a SpawnRegion
 * and SpawnedResourceWithResource[] separately.
 *
 * ```
 * { resources, ...rest } = getSpawnRegionWithResources()
 * const spawnRegion: SpawnRegion = rest
 * ```
 * ---
 *
 * @param id
 * @param prismaClient
 * @returns SpawnRegionWithResources
 */
export const getSpawnRegionWithResources = async (
  id: string,
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
    spawnRegion.SpawnedResources.map((spawnedResource) => {
      const { resource, ...rest } = spawnedResource;
      return {
        ...rest,
        resource: resource,
      };
    });

  const { SpawnedResources, ...restSpawnRegion } = spawnRegion;

  // Include resources
  return {
    ...restSpawnRegion,
    resources,
  } as SpawnRegionWithResources;
};

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
