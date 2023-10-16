import { ItemType } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets a UserInventoryItem, by id
 * If the `id` is not known, use `getUserInventoryItemByItemId()`
 *
 * **Throws error** if not found
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
 *
 * **Throws error** if not found
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

/**
 * ### Upserts (updates or creates) a UserInventoryItem with a delta quantity
 * If deltaQuantity is negative (removing quantity), the UserInventoryItem must already exist!
 * (An upsert will not be performed, i.e. we don't create a new UserInventoryItem to remove quantity, this is an error!)
 *
 * Will **throw** a RecordNotFound error if the UserInventoryItem doesn't exist for a negative deltaQuantity
 * @param itemId
 * @param itemType
 * @param userId
 * @param deltaQuantity
 * @param prismaClient
 * @returns
 */
export const upsertUserInventoryItem = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
  deltaQuantity: number,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  // If we are adding quantity, perform normal upsert (update OR create)
  if (deltaQuantity > 0) {
    return await prismaClient.userInventoryItem.upsert({
      where: {
        userId_itemId: {
          userId: userId,
          itemId: itemId,
        },
      },
      update: {
        quantity: {
          increment: deltaQuantity, // see https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#operators
        },
      },
      create: {
        itemId: itemId,
        itemType: itemType,
        userId: userId,
        quantity: deltaQuantity,
      },
    });
  } else {
    // If we are subtracting quantity, only update, no upsert
    return await prismaClient.userInventoryItem.update({
      where: {
        userId_itemId: {
          userId: userId,
          itemId: itemId,
        },
      },
      data: {
        quantity: {
          decrement: Math.abs(deltaQuantity), // see https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#operators
        },
      },
    });
  }
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
  return await prismaClient.userInventoryItem.delete({
    where: {
      id: userInventoryItemId,
    },
  });
};
