import { ItemType } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets a UserInventoryItem, by id
 * If the `id` is not known, use `getUserInventoryItemByItemId()`
 * @param userInventoryItemId
 * @param prismaClient
 * @returns
 */
export const getUserInventoryItemById = async (
  userInventoryItemId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.userInventoryItem.findFirstOrThrow({
    where: {
      id: userInventoryItemId,
    },
  });
};

/**
 * ### Gets a UserInventoryItem by lookup using the itemId, itemType, and userId
 * Use this if you don't know the `id` of the UserInventoryItem
 * @param itemId
 * @param itemType
 * @param userId
 * @param prismaClient
 * @returns
 */
export const getUserInventoryItemByItemId = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.userInventoryItem.findFirstOrThrow({
    where: {
      userId: userId,
      itemId: itemId,
      itemType: itemType,
    },
  });
};

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
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return await prismaClient.userInventoryItem.upsert({
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

/**
 * ### Deletes a UserInventoryItem, by the id
 * @param userInventoryItemId
 * @param prismaClient
 */
export const deleteUserInventoryItem = async (
  userInventoryItemId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  await prismaClient.userInventoryItem.delete({
    where: {
      id: userInventoryItemId,
    },
  });
};
