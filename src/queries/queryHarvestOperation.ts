import { Prisma } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import { logger } from "../logger/logger";
import { getSpawnRegionParentOfSpawnedResource } from "../services/spawnRegionService";

export const createHarvestOperation = async (
  partialModel: Prisma.HarvestOperationCreateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvestOperation.create({
    data: partialModel,
  });
};

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
