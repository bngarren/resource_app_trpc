import {
  prisma_createHarvesterUserInventoryItem,
  prisma_createResourceUserInventoryItem,
  prisma_deleteHarvesterUserInventoryItem,
  prisma_deleteResourceUserInventoryItem,
  prisma_getResourceUserInventoryItemByUrl,
  prisma_upsertHarvesterUserInventoryItem,
  prisma_upsertResourceUserInventoryItem,
} from "./../queries/queryUserInventoryItem";
import { ItemType, Prisma } from "@prisma/client";
import {
  InventoryItem,
  PlayerInventory,
  UserInventoryDict,
  UserInventoryItemWithAnyItem,
  UserInventoryItemWithItem,
} from "../types";
import { logger } from "../logger/logger";
import {
  prisma_getUserInventoryItemByItemId,
  prisma_getAllUserInventoryItems,
} from "../queries/queryUserInventoryItem";

/**
 * ### Adds a new Resource item to the user's inventory
 * @returns
 */
export const addResourceToUserInventory = async (
  resourceId: string,
  userId: string,
  quantity = 1,
) => {
  if (quantity <= 0) {
    throw new Error(
      `Quantity cannot be less than or equal to 0 (received ${quantity})`,
    );
  }
  return await prisma_createResourceUserInventoryItem({
    itemType: "RESOURCE",
    quantity,
    userId,
    resourceId,
  });
};

/**
 * ### Adds a new Harvester item to the user's inventory
 * @returns
 */
export const addHarvesterToUserInventory = async (
  harvesterId: string,
  userId: string,
  quantity = 1,
) => {
  if (quantity <= 0) {
    throw new Error(
      `Quantity cannot be less than or equal to 0 (received ${quantity})`,
    );
  }
  return await prisma_createHarvesterUserInventoryItem({
    itemType: "HARVESTER",
    quantity,
    userId,
    harvesterId,
  });
};

/**
 * ### Gets a user's specific inventory item based on the item id
 * - The `itemId` refers to the `id` primary key of the associated table, e.g.
 * Resource, Harvester, etc.
 * - The `itemType` specifies the table for this item
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const getUserInventoryItemWithItemId = async <T extends ItemType>(
  itemId: string,
  itemType: T,
  userId: string,
): Promise<UserInventoryItemWithItem<T>> => {
  return await prisma_getUserInventoryItemByItemId(itemId, itemType, userId);
};

/**
 * ### Gets all inventory items for a user, categorized by item type
 * 
 * A `UserInventoryDict` with an example shape:
 * ```typescript
 * {
    resources: UserInventoryItemWithItem<"RESOURCE">[];
    harvesters: UserInventoryItemWithItem<"HARVESTER">[];
   }
 * 
 * ```
 * @returns a `UserInventoryDict`
 */
export const getUserInventoryItems = async (userId: string) => {
  return await prisma_getAllUserInventoryItems(userId);
};

/**
 * ### Gets a ResourceUserInventoryItem by the Resource url
 * - The `resourceUrl` refers to the `url` field (_unique_) on the Resource table
 *   - Example: 'gold' or 'arcane_flux'
 *
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const getResourceUserInventoryItemByUrl = async (
  resourceUrl: string,
  userId: string,
): Promise<UserInventoryItemWithItem<"RESOURCE">> => {
  return await prisma_getResourceUserInventoryItemByUrl(resourceUrl, userId);
};

type UpsertResourceInput = Omit<
  Prisma.ResourceUserInventoryItemUncheckedCreateInput,
  "resourceId"
>;
type UpsertHarvesterInput = Omit<
  Prisma.HarvesterUserInventoryItemUncheckedCreateInput,
  "harvesterId"
>;

/**
 * ### Updates or creates a new user inventory item
 * - The new item will be created in the table (i.e. Resource, Harvester) according
 * to the `itemType` within `data`.
   - The `data` parameter includes all data necessary to create a new user inventory item,
 *  **except** for item's primary key, e.g. `resourceId` or `harvesterId`, as this can only
   be set once the itemType has been discriminated.
 * @returns UserInventoryItemWithAnyItem
 */
export const upsertUserInventoryItem = async (
  itemId: string,
  data: UpsertResourceInput | UpsertHarvesterInput,
): Promise<UserInventoryItemWithAnyItem> => {
  // We use these type guard functions to narrow `data` based on itemType

  const isResourceInput = (data: unknown): data is UpsertResourceInput => {
    return (data as UpsertResourceInput).itemType === ItemType.RESOURCE;
  };

  const isHarvesterInput = (data: unknown): data is UpsertHarvesterInput => {
    return (data as UpsertHarvesterInput).itemType === ItemType.HARVESTER;
  };

  switch (data.itemType) {
    case ItemType.HARVESTER:
      if (isResourceInput(data)) {
        return await prisma_upsertResourceUserInventoryItem({
          ...data,
          resourceId: itemId,
        });
      }

    case ItemType.HARVESTER:
      if (isHarvesterInput(data)) {
        return await prisma_upsertHarvesterUserInventoryItem({
          ...data,
          harvesterId: itemId,
        });
      }
    default:
      throw new Error(`Invalid itemType (${data.itemType}`);
  }
};

/**
 * ### Removes a user's inventory item based on the item's id
 * - The `itemId` refers to the `id` primary key of the associated table, e.g.
 * Resource, Harvester, etc.
 * - The `itemType` specifies the table for this item
 * @returns A `UserInventoryItemWithItem` type which includes the item details

 */
export const removeUserInventoryItemByItemId = async <T extends ItemType>(
  itemId: string,
  itemType: T,
  userId: string,
) => {
  switch (itemType) {
    case "RESOURCE":
      return (await prisma_deleteResourceUserInventoryItem(
        itemId,
        userId,
      )) as UserInventoryItemWithItem<T>;
    case "HARVESTER":
      return (await prisma_deleteHarvesterUserInventoryItem(
        itemId,
        userId,
      )) as UserInventoryItemWithItem<T>;
    default:
      throw new Error(`Invalid itemType (${itemType})s`);
  }
};

/**
 * ### Updates, creates, or removes a user inventory item with a new quantity
 * This function is **idempotent**.
 *
 * If `newQuantity` is 0, the user inventory item **is removed**.
 *
 * This function requires itemId, itemType, and userId in order to create a new
 * UserInventoryItem, if a new one needs to be created
 *
 * @param itemId The resourceId, componentId, or harvesterId
 * @param itemType
 * @param userId
 * @param newQuantity
 * @returns UserInventoryItem - updated, created, or the item that was removed
 */
export const updateCreateOrRemoveUserInventoryItemWithNewQuantity = async <
  T extends ItemType,
>(
  itemId: string,
  itemType: T,
  userId: string,
  newQuantity = 1,
) => {
  // Cannot have negative quantity
  if (newQuantity < 0) {
    throw new Error(
      `Cannot update user inventory item (${itemType} with itemId ${itemId}) to a negative quantity (${newQuantity})`,
    );
  }

  // Remove inventory item if quantity is set to 0
  if (newQuantity === 0) {
    const removed = removeUserInventoryItemByItemId(itemId, itemType, userId);
    logger.debug(
      removed,
      `User inventory item removed due to quantity=0 after update`,
    );
    return removed;
  }

  // Otherwise, upsert (update or create) the inventory item with this new quantity
  return (await upsertUserInventoryItem(itemId, {
    itemType,
    quantity: newQuantity,
    userId,
  })) as UserInventoryItemWithItem<T>;
};

/**
 * ### Transforms a user inventory item representation (backend) to a player inventory item (client)
 * @param userInventoryItem - A `UserInventoryItemWithAnyItem` type
 * @returns InventoryItem
 */
export const getPlayerInventoryItemFromUserInventoryItem = (
  userInventoryItem: UserInventoryItemWithAnyItem,
) => {
  return {
    id: userInventoryItem.id,
    name: userInventoryItem.item.name,
    type: userInventoryItem.itemType,
    quantity: userInventoryItem.quantity,
  } as InventoryItem;
};

/**
 * ### Transforms all user inventory items (backend) into a player inventory (client)
 * @param userInventoryDict
 * @returns
 */
export const getPlayerInventoryFromUserInventoryItems = (
  userInventoryDict: UserInventoryDict,
): PlayerInventory => {
  const resources = userInventoryDict.resources.map((r) =>
    getPlayerInventoryItemFromUserInventoryItem(r),
  );
  const harvesters = userInventoryDict.harvesters.map((h) =>
    getPlayerInventoryItemFromUserInventoryItem(h),
  );

  return {
    timestamp: new Date().toISOString(),
    items: [...resources, ...harvesters],
  };
};

/**
 * ### Ensures that an update to a user inventory item should be permitted
 * - When withdrawing an item, checks that the amount does not exceed the current quantity
 *
 * @param amount Positive = going INTO inventory; Negative = going OUT of inventory
 * @returns If successful, returns the UserInventoryItem. Otherwise, should throw error.
 */
export const validateUserInventoryItemTransfer = async <T extends ItemType>(
  itemId: string,
  itemType: T,
  userId: string,
  amount: number,
): Promise<UserInventoryItemWithItem<T>> => {
  const itemToValidate = await prisma_getUserInventoryItemByItemId<T>(
    itemId,
    itemType,
    userId,
  );

  // Withdrawal from inventory
  if (amount < 0 && itemToValidate.quantity < Math.abs(amount)) {
    throw new Error(
      `Cannot transfer ${amount} unit(s) of itemId (${itemId}), itemType (${itemType}) out of user's (userId=${userId}) inventory that only contains ${itemToValidate.quantity} unit(s)!`,
    );
  }

  // TODO: Perform other checks here, e.g. is there enough inventory space?

  return itemToValidate as UserInventoryItemWithItem<T>;
};
