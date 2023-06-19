import { RegionWithResources } from "./../types/index";
import { Prisma, PrismaClient, Region, Resource } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import isRegionStale from "../util/isRegionStale";
import config from "../config";
import { generateResourceModelsForRegion } from "../services/resourceService";
import { getAllSettled } from "../util/getAllSettled";
import { updateRegion } from "./queryRegion";

export const createResource = async (
  model: Prisma.ResourceCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<Resource> => {
  return await prismaClient.resource.create({
    data: model,
  });
};

export const createResources = async (
  models: Prisma.ResourceCreateManyInput[],
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<Resource[]> => {
  await prismaClient.resource.createMany({ data: models, skipDuplicates: true });

  const regionIds = models.map((m) => m.regionId);

  return await prismaClient.resource.findMany({
    where: {
      regionId: {
        in: regionIds,
      },
    },
  });
};

export const getResourcesForRegion = async (
    regionId: number,
    prismaClient: PrismaClientOrTransaction = prisma
    ) => {
  return await prismaClient.resource.findMany({
    where: {
      regionId: regionId,
    },
  });
};

export const deleteResourcesForRegion = async (regionId: number, prismaClient: PrismaClientOrTransaction = prisma) => {
  return await prismaClient.resource.deleteMany({
    where: {
      regionId: regionId,
    },
  });
};

export const updateResourcesForRegionTransaction = async (
  region: RegionWithResources
) => {
  if (!region) {
    throw new Error("Could not update resources for region");
  }

  let trxResult: RegionWithResources;

  const resources =
    region.resources || (await getResourcesForRegion(region.id));

  try {
    trxResult = await prisma.$transaction(async (trx) => {
      // * - - - - - - - START TRANSACTION - - - - - - - -

      // If region's "reset_date" is stale/overdue, then repopulate
      // all resources
      if (resources.length === 0 || isRegionStale(region)) {
        console.log(`REGION ${region.id} IS STALE`);

        // Delete old resources, if present
        const res_1 = await deleteResourcesForRegion(region.id, trx)

        //safety check
        if (resources.length > 0 && res_1.count === 0) {
          throw new Error("Delete resources failed");
        }

        // Populate new resources (random type and scarcity)
        const resourceModels = generateResourceModelsForRegion(
          region,
          [config.min_resources_per_region, config.max_resources_per_region],
          config.resource_h3_resolution
        );

        const newResources = await getAllSettled(
          resourceModels.map((model) => createResource(model, trx))
        );

        //safety check
        if (newResources.length !== resourceModels.length) {
          throw new Error("Populating resources failed");
        }

        // Update region's resetDate to be current time + reset interval
        // Update region's updatedAt to be current time
        const now = new Date();
        const nextResetDate = new Date();
        nextResetDate.setDate(
          nextResetDate.getDate() + config.region_reset_interval
        );

        const newRegionData = {
            resetDate: nextResetDate.toISOString(),
            updatedAt: now.toISOString(),
          }
        const res_3 =  await updateRegion(region.id, newRegionData, trx)

        if (!res_3) {
          throw new Error("Modifying region's resetDate and/or updatedAt failed");
        }

        // Finally, return the updated region
        const updatedRegion: RegionWithResources = {
          ...res_3,
          resources: newResources,
        };
        return updatedRegion;
      }
      // return unmodified region
      return region;
    });
  } catch (error) {
    console.error("Error within updateResourcesForRegionTransaction" + error);

    // Any transaction query should be automatically rolled-back
    throw error;
  }
  return trxResult;
};
