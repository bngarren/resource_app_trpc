import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets all UserInventoryItems associated with a User, by user id
 * @param userId The user id of our User table in our app database (not authentication, e.g. Firebase uid)
 * @param prismaClient
 * @returns an array of UserInventoryItem or empty []
 */
export const getUserInventoryItemsByUserId = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.userInventoryItem.findMany({
    where: {
      userId,
    },
  });
};
