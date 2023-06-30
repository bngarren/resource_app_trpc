import { UserInventoryItem } from "@prisma/client";
import { getUserInventoryByUserId } from "../queries/queryUserInventoryItem";
import { prisma } from "../prisma";

export const getUserInventory = async (userId: string) => {
  return await getUserInventoryByUserId(userId);
};

export const addResourceToUserInventory = async (
  resourceId: string,
  userId: string,
  quantity: number,
): Promise<UserInventoryItem> => {
  return await prisma.userInventoryItem.create({
    data: {
      user: {
        connect: {
          id: userId,
        },
      },
      itemId: resourceId,
      itemType: "RESOURCE",
      quantity,
    },
  });
};
