import {
  Harvester,
  ItemType,
  Resource,
  UserInventoryItem,
} from "@prisma/client";
import {
  deleteUserInventoryItem,
  getUserInventoryItemByItemId,
  getUserInventoryItemsByUserId,
  upsertUserInventoryItem,
} from "../queries/queryUserInventoryItem";
import { prisma } from "../prisma";
import { InventoryItem, PlayerInventory } from "../types";
import { logger } from "../logger/logger";
import { getResourcesByIds } from "../queries/queryResource";
import { getHarvestersByIds } from "../queries/queryHarvester";
import { getResource } from "./resourceService";
import { getHarvester } from "./harvesterService";

/**
 * ### Gets a UserInventoryItem from an itemId
 * An itemType and userId is also required in order to locate the correct user's inventory item
 *
 * **This function should be used over the database-specific query `getUserInventoryItemByItemId()`**
 *
 * **Throws error** if not found
 * @param itemId
 * @param itemType
 * @param userId
 * @returns
 */
export const getUserInventoryItemWithItemId = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
) => {
  return await getUserInventoryItemByItemId(itemId, itemType, userId);
};

/**
 * ### Gets all UserInventoryItems associated with a User
 * @param userId
 * @returns
 */
export const getUserInventoryItems = async (userId: string) => {
  return await getUserInventoryItemsByUserId(userId);
};

/**
 * ### Adds a new or updates an existing user inventory item
 * TODO: if quantity is zero, should delete the user inventory item
 *
 *
 * This function requires itemId, itemType, and userId in order to create a new
 * UserInventoryItem, if necessary.
 *
 * @param itemId The resourceId, componentId, or harvesterId
 * @param itemType
 * @param userId
 * @param quantity
 * @returns
 */
export const addOrUpdateUserInventoryItem = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
  quantity = 1,
) => {
  return await upsertUserInventoryItem(itemId, itemType, userId, quantity);
};

/**
 * ### Removes a UserInventoryItem from a user's inventory.
 *
 * This requires passing the unique `id` of the UserInventoryItem.
 * If the id is not known, use `removeUserInventoryItemByItemId()`
 *
 * @param userInventoryItemId
 * @returns
 */
export const removeUserInventoryItem = async (userInventoryItemId: string) => {
  return await deleteUserInventoryItem(userInventoryItemId);
};

/**
 * ### Removes a UserInventoryItem from a user's inventory
 * #### Instead of using the `id` of the UserInventoryItem, it performs a lookup based on the itemId and itemType
 * If you already know the `id`, should use `removeUserInventoryItem()`
 * @param itemId
 * @param itemType
 * @param userId
 */
export const removeUserInventoryItemByItemId = async (
  itemId: string,
  itemType: ItemType,
  userId: string,
) => {
  const userInventoryItem = await getUserInventoryItemWithItemId(
    itemId,
    itemType,
    userId,
  );
  return await deleteUserInventoryItem(userInventoryItem.id);
};

/**
 * TODO: Need to refactor this to go through queryUserInventory instead of prisma calls directly...
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

/**
 * ### Returns an InventoryItem from a UserInventoryItem model
 * This converts a server-side UserInventoryItem into a client-facing InventoryItem (including details
 * about the specific item)
 * @param userInventoryItem
 * @returns
 */
export const getInventoryItemFromUserInventoryItem = async (
  userInventoryItem: UserInventoryItem,
) => {
  let itemDetails: Resource | Harvester | undefined;

  // Must switch on itemType to know which table to look up with itemId
  switch (userInventoryItem.itemType) {
    case ItemType.RESOURCE:
      itemDetails = await getResource(userInventoryItem.itemId);
      break;
    case ItemType.COMPONENT:
      break; // TODO
    case ItemType.HARVESTER:
      itemDetails = await getHarvester(userInventoryItem.itemId);
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
};

/**
 * ### Assembles a PlayerInventory object from the UserInventoryItems associated with a User
 * - UserInventoryItems are the database representation of a user "owning" a certain item (i.e., resource, component, harvester, etc.)
 * - An InventoryItem is the client-facing representation, which is held within a PlayerInventory
 *
 * #### Details
 * - This function takes an array of a user's UserInventoryItems and builds each into an InventoryItem by
 * combining with the actual item representation (Resource, Component, Harvester) to provide additional data
 * - The client-facing PlayerInventory object holds the InventoryItems, as well as additional metadata...TBD
 * @param userInventoryItems
 * @returns PlayerInventory
 */
export const getPlayerInventoryFromUserInventoryItems = async (
  userInventoryItems: UserInventoryItem[],
): Promise<PlayerInventory> => {
  // Collect the item IDs for each item type
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
  const resources = await getResourcesByIds(resourceIds);

  // TODO Need to implement components
  /* const components = await prisma.component.findMany({
    where: {
      id: {
        in: componentIds,
      },
    },
  }); */

  const harvesters = await getHarvestersByIds(harvesterIds);

  /* 
  Build each inventory item by combining data from a UserInventoryItem and the specific
  item type (i.e. Resource, Component, Harvester)
  */
  const items = userInventoryItems.map((userInventoryItem) => {
    let itemDetails: Resource | Harvester | undefined;

    // Must switch on itemType to know which table to look up with itemId
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
