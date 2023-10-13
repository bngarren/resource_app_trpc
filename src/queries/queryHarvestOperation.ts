import { Prisma } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import { logger } from "../logger/logger";
import { getSpawnRegionParentOfSpawnedResource } from "../services/spawnRegionService";
import { HarvestOperationWithResetDate } from "../types";

/**
 * ### Returns all harvest operations associated with this harvester
 * - May return empty [] if no harvest operations are associated
 * @param harvesterId
 * @returns
 */
export const getHarvestOperationsForHarvesterId = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.findMany({
    where: {
      harvesterId: harvesterId,
    },
  });
};

export const getHarvestOperationsWithResetDateForHarvesterId = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  const res = await prismaClient.harvestOperation.findMany({
    where: {
      harvesterId: harvesterId,
    },
    include: {
      spawnedResource: {
        include: {
          spawnRegion: {
            select: {
              resetDate: true,
            },
          },
        },
      },
    },
  });
  const harvestOperationsWithResetDate = res.map((ho) => {
    const { spawnedResource, ...harvestOperation } = ho;
    return {
      ...harvestOperation,
      resetDate: ho.spawnedResource?.spawnRegion?.resetDate || null,
    };
  });
  return harvestOperationsWithResetDate as HarvestOperationWithResetDate[];
};

/**
 * ### Creates a new Harvest Operation
 * @param partialModel
 * @param prismaClient
 * @returns
 */
export const createHarvestOperation = async (
  partialModel: Prisma.HarvestOperationCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.create({
    data: partialModel,
  });
};

/**
 * This type is used in the `createHarvestOperationsTransaction()`
 */
export type CreateHarvestOperationsTransactionInput = {
  harvesterId: string;
  spawnedResourceIds: string[];
};

/**
 * ### Creates new HarvestOperations for a given harvester and spawned resources
 * @param input containing the harvesterId and the spawnedResources that can be harvested
 * @returns
 */
export const createHarvestOperationsTransaction = async (
  input: CreateHarvestOperationsTransactionInput,
) => {
  let trxResult;
  try {
    trxResult = await prisma.$transaction(async (trx) => {
      // * - - - - - - - START TRANSACTION - - - - - - - -

      // Loop through each spawned resource and create a HarvestOperation
      return await Promise.all(
        input.spawnedResourceIds.map(async (spawnedResourceId) => {
          // get the parent spawn region of this resource so we can get the reset_date
          const spawnRegion = await getSpawnRegionParentOfSpawnedResource(
            spawnedResourceId,
          );

          return await createHarvestOperation(
            {
              harvester: {
                connect: {
                  id: input.harvesterId,
                },
              },
              spawnedResource: {
                connect: {
                  id: spawnedResourceId,
                },
              },
              endTime: spawnRegion.resetDate,
            },
            trx, // pass in the transaction client
          );
        }),
      );
    });
    return trxResult; // Returns HarvestOperation[] if successful
  } catch (error) {
    logger.error(error, "Error within createHarvestOperationsTransaction");

    // Any transaction query above should be automatically rolled-back

    return null; // Returns null if transaction failed
  }
};

export const updateHarvestOperationById = async (
  harvestOperationId: string,
  partialModel: Prisma.HarvestOperationUpdateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.update({
    where: {
      id: harvestOperationId,
    },
    data: partialModel,
  });
};

export const updateHarvestOperationsTransaction = async (
  models: Prisma.HarvestOperationUpdateInput[],
) => {
  let trxResult;
  try {
    trxResult = await prisma.$transaction(async (trx) => {
      // * - - - - - - - START TRANSACTION - - - - - - - -
      return await Promise.all(
        models.map((harvestOperation) => {
          const { id: harvestOperationId, ...partialModel } = harvestOperation;

          if (harvestOperationId == null) {
            throw new Error("Missing id for harvest operation");
          }

          return updateHarvestOperationById(
            harvestOperationId as string,
            partialModel,
            trx,
          );
        }),
      );
    });
    return trxResult;
  } catch (error) {
    logger.error(error, "Error within updateHarvestOperationsTransaction");
    // Any transaction query above should be automatically rolled-back
    return null; // Returns null if transaction failed
  }
};

export const deleteHarvestOperationsForHarvesterId = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.deleteMany({
    where: {
      harvesterId: harvesterId,
    },
  });
};
