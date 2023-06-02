import { Prisma, Region } from "@prisma/client";
import { prisma } from "../prisma";

export const createRegion = async (
  model: Prisma.RegionCreateInput
): Promise<Region> => {
  return await prisma.region.create({
    data: model,
  });
};

export const createRegions = async (
  models: Prisma.RegionCreateManyInput[]
): Promise<Region[]> => {
    await prisma.region.createMany({ data: models, skipDuplicates: true });

    const h3Indices = models.map((m) => m.h3Index)

    return await prisma.region.findMany({
        where: {
            h3Index: {
                in: h3Indices
            }
        }
    })

};

export const getRegionsFromH3Array = async (
  h3Array: string[]
): Promise<Region[]> => {
  const regions = await prisma.region.findMany({
    where: {
      h3Index: {
        in: h3Array,
      },
    },
  });

  return regions;
};

export const getRegionById = async (id: number) => {
  const region = await prisma.region.findUnique({
    where: {
      id: id,
    },
  });
  return region;
};
