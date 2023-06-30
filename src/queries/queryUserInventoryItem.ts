import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets all UserInventoryItems associated with a User, by user id
 * @param userId The user id of our app database (not authentication)
 * @param prismaClient
 * @returns an array of UserInventoryItem
 */
export const getUserInventoryByUserId = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.userInventoryItem.findMany({
    where: {
      userId,
    },
  });
};
