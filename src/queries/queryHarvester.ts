import { Prisma } from "@prisma/client";
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

/**
 * ### Gets all Harvesters owned by a user, by the userId
 * @param userId
 * @param prismaClient
 * @returns
 */
export const getHarvestersByUserId = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.harvester.findMany({
    where: {
      userId: userId,
    },
  });
};

export const updateHarvesterById = async (
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
