import { ItemType } from "@prisma/client";
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

export const upsertUserInventoryItem = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
  quantity: number,
) => {
  return await prisma.userInventoryItem.upsert({
    where: {
      userId_itemId: {
        userId: userId,
        itemId: itemId,
      },
    },
    update: {
      quantity: {
        increment: quantity, // see https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#operators
      },
    },
    create: {
      itemId: itemId,
      itemType: itemType,
      userId: userId,
      quantity: quantity,
    },
  });
};
