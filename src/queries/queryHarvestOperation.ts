import { Prisma } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import { logger } from "../logger/logger";
import { getSpawnRegionParentOfSpawnedResource } from "../services/spawnRegionService";
import {
  HarvestOperationWithResetDate,
  HarvestOperationWithSpawnedResourceWithResource,
} from "../types";

/**
 * ### Creates a new Harvest Operation
 */
export const prisma_createHarvestOperation = async (
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
export const prisma_createHarvestOperationsTransaction = async (
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

          return await prisma_createHarvestOperation(
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

/**
 * ### Gets all harvest operations associated with this harvester, by harvesterId (primary key)
 * - May return empty [] if no harvest operations are associated
 */
export const prisma_getHarvestOperationsForHarvesterId = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.findMany({
    where: {
      harvesterId: harvesterId,
    },
  });
};

/**
 * ### Gets HarvestOperations for a given harvester, by harvesterId (primary key), with SpawnedResource
 * - May return empty [] if no harvest operations are associated
 *
 * The return type is an array of HarvestOperations & { spawnedResource },
 * of which 'spawnedResource' is a `SpawnedResourceWithResource` type
 * thus the overall return type is an array, `HarvestOperationWithSpawnedResource[]` type
 */
export const prisma_getHarvestOperationsWithSpawnedResourceForHarvesterId =
  async (
    harvesterId: string,
    prismaClient: PrismaClientOrTransaction = prisma,
  ): Promise<HarvestOperationWithSpawnedResourceWithResource[]> => {
    return await prismaClient.harvestOperation.findMany({
      where: {
        harvesterId: harvesterId,
      },
      include: {
        spawnedResource: {
          include: {
            resource: true,
          },
        },
      },
    });
  };

/**
 * ### Gets HarvestOperations for a given harvester, by harvesterId (primary key), with resetDate
 * The return type is an array of HarvestOperations & { resetDate },
 * i.e. `HarvestOperationWithResetDate[]` type
 *
 * Useful when you know you will also need the Spawn Region's 'resetDate' when
 * getting HarvestOperations
 */
export const prisma_getHarvestOperationsWithResetDateForHarvesterId = async (
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
 * ### Updates a HarvestOperation, by id (primary key)
 */
export const prisma_updateHarvestOperationById = async (
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

/**
 * ### Updates HarvestOperations in transaction
 *
 * Will return **null** if the transaction fails
 */
export const prisma_updateHarvestOperationsTransaction = async (
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

          return prisma_updateHarvestOperationById(
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

/**
 * ### Deletes all HarvestOperations for a Harvester, by harvester id (primary key)
 */
export const prisma_deleteHarvestOperationsForHarvesterId = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.deleteMany({
    where: {
      harvesterId: harvesterId,
    },
  });
};
