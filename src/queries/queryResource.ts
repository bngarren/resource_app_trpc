import { Prisma, Resource } from "@prisma/client";
import { prisma } from "../prisma";


export const createResource = async (
  model: Prisma.ResourceCreateInput
): Promise<Resource> => {
  return await prisma.resource.create({
    data: model,
  });
};

export const createResources = async (
  models: Prisma.ResourceCreateManyInput[]
): Promise<Resource[]> => {
    await prisma.resource.createMany({ data: models, skipDuplicates: true });

    const regionIds = models.map((m) => m.regionId)

    return await prisma.resource.findMany({
        where: {
            regionId: {
                in: regionIds
            }
        }
    })

};