import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets a Harvester, by the provided Id
 * @param harvesterId
 * @param prismaClient
 * @returns
 */
export const getHarvesterById = async (
  harvesterId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvester.findUniqueOrThrow({
    where: {
      id: harvesterId,
    },
  });
};

/**
 * ### Gets all Harvesters, by the provided Ids
 * @param harvesterIds
 * @param prismaClient
 * @returns
 */
export const getHarvestersByIds = async (
  harvesterIds: string[],
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvester.findMany({
    where: {
      id: {
        in: harvesterIds,
      },
    },
  });
};
