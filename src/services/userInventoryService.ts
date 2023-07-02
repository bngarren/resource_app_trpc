import {
  Harvester,
  ItemType,
  Resource,
  UserInventoryItem,
} from "@prisma/client";
import { getUserInventoryItemsByUserId } from "../queries/queryUserInventoryItem";
import { prisma } from "../prisma";
import { InventoryItem, PlayerInventory } from "../types";
import { logger } from "../logger/logger";

export const getUserInventoryItems = async (userId: string) => {
  return await getUserInventoryItemsByUserId(userId);
};

/**
 * ### Adds a resource to a user's inventory
 * - Resource and User must already exist in the database, thus we are using their respective id's
 * - This effectively creates a new UserInventoryItem in the database
 *   - The itemId is the resourceId
 *   - The itemType is "RESOURCE"
 * - See separate functions are adding components and harvesters
 * @param resourceId
 * @param userId
 * @param quantity
 * @returns UserInventoryItem
 */
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

export const getPlayerInventoryFromUserInventoryItems = async (
  userInventoryItems: UserInventoryItem[],
): Promise<PlayerInventory> => {
  // Collect the item IDs for each type
  const resourceIds = userInventoryItems
    .filter((item) => item.itemType === "RESOURCE")
    .map((item) => item.itemId);
  const componentIds = userInventoryItems
    .filter((item) => item.itemType === "COMPONENT")
    .map((item) => item.itemId);
  const harvesterIds = userInventoryItems
    .filter((item) => item.itemType === "HARVESTER")
    .map((item) => item.itemId);

  // Query each table once to get the details for all items of each type
  const resources = await prisma.resource.findMany({
    where: {
      id: {
        in: resourceIds,
      },
    },
  });

  // TODO Need to implement components
  /* const components = await prisma.component.findMany({
    where: {
      id: {
        in: componentIds,
      },
    },
  }); */

  const harvesters = await prisma.harvester.findMany({
    where: {
      id: {
        in: harvesterIds,
      },
    },
  });

  /* 
  Build each inventory item by combining data from a UserInventoryItem and the specific
  item type (i.e. Resource, Component, Harvester)
  */
  const items = userInventoryItems.map((userInventoryItem) => {
    let itemDetails: Resource | Harvester | undefined;

    switch (userInventoryItem.itemType) {
      case ItemType.RESOURCE:
        itemDetails = resources.find((r) => r.id === userInventoryItem.itemId);
        break;
      case ItemType.COMPONENT:
        break; // TODO
      case ItemType.HARVESTER:
        itemDetails = harvesters.find((r) => r.id === userInventoryItem.itemId);
        break;
    }

    if (!itemDetails) {
      logger.error(
        `Failed to get associated itemDetails for userInventoryItem (${userInventoryItem.id}) with itemId (${userInventoryItem.itemId})`,
      );
    }

    return {
      id: userInventoryItem.id,
      name: itemDetails?.name ?? "error",
      type: userInventoryItem.itemType,
      quantity: userInventoryItem.quantity,
      metadata: itemDetails?.metadata ?? "error",
    } as InventoryItem;
  });

  return {
    timestamp: new Date().toISOString(),
    items,
  } as PlayerInventory;
};
