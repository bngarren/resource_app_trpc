import { Prisma } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets a Harvester, by the harvester id (primary key)
 */
export const prisma_getHarvesterById = async (
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
 * ### Gets all Harvesters, by array of harvester ids (primary keys)
 */
export const prisma_getHarvestersByIds = async (
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

/**
 * ### Gets all Harvesters owned by a user, by the userId (primary key)
 */
export const prisma_getHarvestersByUserId = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvester.findMany({
    where: {
      userId: userId,
    },
  });
};

/**
 * ### Updates a Harvester, by the harvester id (primary key)
 */
export const prisma_updateHarvesterById = async (
  harvesterId: string,
  partialModel: Prisma.HarvesterUpdateInput,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvester.update({
    data: {
      ...partialModel,
    },
    where: {
      id: harvesterId,
    },
  });
};
