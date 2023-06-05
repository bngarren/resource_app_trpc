import { Prisma, PrismaClient, Region } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import { RegionWithResources } from "../types";

export const createRegion = async (
  model: Prisma.RegionCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma
): Promise<Region> => {
  return await prismaClient.region.create({
    data: model,
  });
};

export const createRegions = async (
  models: Prisma.RegionCreateManyInput[],
  prismaClient: PrismaClientOrTransaction = prisma
): Promise<Region[]> => {
  await prismaClient.region.createMany({ data: models, skipDuplicates: true });

  const h3Indices = models.map((m) => m.h3Index);

  return await prismaClient.region.findMany({
    where: {
      h3Index: {
        in: h3Indices,
      },
    },
  });
};

export const getRegionsFromH3Array = async (
  h3Array: string[],
  prismaClient: PrismaClientOrTransaction = prisma
): Promise<Region[]> => {
  const regions = await prismaClient.region.findMany({
    where: {
      h3Index: {
        in: h3Array,
      },
    },
  });

  return regions;
};

/**
 * Returns a Region or a RegionWithResources, depending on the
 * `withResources` parameter (default is true)
 * @param id regionId
 * @param withResources Whether to includes the associated resources in the returned region object
 * @returns Region or RegionWithResources
 */
export const getRegionById = async (
  id: number,
  withResources = true,
  prismaClient: PrismaClientOrTransaction = prisma
) => {

    let region: Region | RegionWithResources

    if (withResources) {
        region = await prismaClient.region.findUniqueOrThrow({
            where: {
              id: id,
            },
            include: {
              resources: true,
            },
          }) as RegionWithResources
    } else {
        region = await prismaClient.region.findUniqueOrThrow({
            where: {
              id: id,
            },
          }) as Region
    }
    return region
};

export const updateRegion = async (
  id: number,
  partialModel: Prisma.RegionUpdateInput,
  prismaClient: PrismaClientOrTransaction = prisma
) => {
  return await prismaClient.region.update({
    where: {
      id: id,
    },
    data: {
      ...partialModel,
    },
  });
};
