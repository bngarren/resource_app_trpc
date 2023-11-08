import {
  OmitItemType,
  UserInventoryDict,
  UserInventoryItemWithItem,
} from "./../types/index";
import { ItemType, Prisma } from "@prisma/client";
import { PrismaClientOrTransaction, prisma } from "../prisma";
import { logger } from "../main";

/**
 * ### Creates a new ResourceUserInventoryItem
 * - The `model` must include all necessary params to create this model
 * - The 'itemType' property cannot be included. We always use database default.
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_createResourceUserInventoryItem = async (
  model: OmitItemType<Prisma.ResourceUserInventoryItemCreateInput>,
): Promise<UserInventoryItemWithItem<"RESOURCE">> => {
  return (await prisma.resourceUserInventoryItem.create({
    data: model,
    include: { item: true },
  })) as UserInventoryItemWithItem<"RESOURCE">;
};

/**
 * ### Creates a new HarvesterUserInventoryItem
 * - The `model` must include all necessary params to create this model
 * - The 'itemType' property cannot be included. We always use database default.
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_createHarvesterUserInventoryItem = async (
  model: OmitItemType<Prisma.HarvesterUserInventoryItemCreateInput>,
): Promise<UserInventoryItemWithItem<"HARVESTER">> => {
  return (await prisma.harvesterUserInventoryItem.create({
    data: model,
    include: { item: true },
  })) as UserInventoryItemWithItem<"HARVESTER">;
};

/**
 * ### Gets a specific inventory item, by primary key
 * - Will query the correct table (i.e., Resource, Harvester, etc.) based on `itemType`
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_getUserInventoryItemByItemId = async <T extends ItemType>(
  id: string,
  itemType: T,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<T>> => {
  switch (itemType) {
    case "RESOURCE":
      return (await prismaClient.resourceUserInventoryItem.findUniqueOrThrow({
        where: {
          userId_resourceId: {
            userId,
            resourceId: id,
          },
        },
        include: {
          item: true,
        },
      })) as UserInventoryItemWithItem<T>;
    case "HARVESTER":
      return (await prismaClient.harvesterUserInventoryItem.findUniqueOrThrow({
        where: {
          userId_harvesterId: {
            userId,
            harvesterId: id,
          },
        },
        include: {
          item: true,
        },
      })) as UserInventoryItemWithItem<T>;
    default:
      throw new Error(`Unexpected value: ${itemType}`);
  }
};

/**
 * ### Gets a Resource user inventory item, by primary key
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_getResourceUserInventoryItemByResourceId = async (
  resourceId: string,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return (await prismaClient.resourceUserInventoryItem.findFirstOrThrow({
    where: {
      userId: userId,
      resourceId: resourceId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">;
};

/**
 * ### Gets a ResourceUserInventoryItem by the Resource url
 * - The `resourceUrl` refers to the `url` field (_unique_) on the Resource table
 *
 * **Throws** if not found.
 *
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_getResourceUserInventoryItemByUrl = async (
  resourceUrl: string,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"RESOURCE">> => {
  return (await prismaClient.resourceUserInventoryItem.findFirstOrThrow({
    where: {
      userId: userId,
      item: {
        url: resourceUrl,
      },
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">;
};

/**
 * ### Gets a Harvester user inventory item, by primary key
 * @returns A `UserInventoryItemWithItem` type which includes the item details
 */
export const prisma_getHarvesterUserInventoryItemByHarvesterId = async (
  harvesterId: string,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return (await prismaClient.harvesterUserInventoryItem.findFirstOrThrow({
    where: {
      userId: userId,
      harvesterId: harvesterId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"HARVESTER">;
};

/**
 * ### Gets all of a user's inventory items, categorized by item type
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
export const prisma_getAllUserInventoryItems = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryDict> => {
  const resources = (await prismaClient.resourceUserInventoryItem.findMany({
    where: {
      userId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">[];
  const harvesters = (await prismaClient.harvesterUserInventoryItem.findMany({
    where: {
      userId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"HARVESTER">[];
  return {
    resources,
    harvesters,
  };
};

/**
 * ### Gets all ResourceUserInventoryItem(s) for a user
 * @returns A `UserInventoryItemWithItem<"RESOURCE">` type which includes the item details
 */
export const prisma_getResourceUserInventoryItems = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"RESOURCE">[]> => {
  return (await prismaClient.resourceUserInventoryItem.findMany({
    where: {
      userId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">[];
};

/**
 * ### Gets all HarvesterUserInventoryItem(s) for a user
 * @returns A `UserInventoryItemWithItem<"HARVESTER">` type which includes the item details
 */
export const prisma_getHarvesterUserInventoryItems = async (
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"HARVESTER">[]> => {
  return (await prismaClient.harvesterUserInventoryItem.findMany({
    where: {
      userId,
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"HARVESTER">[];
};

/**
 * ### Updates or Creates a ResourceUserInventoryItem for a user
 * - The `data` param requires all the properties necessary to create a new row
 * - The 'itemType' property cannot be included. We always use database default.
 *
 * @returns A `UserInventoryItemWithItem<"RESOURCE">` type which includes the item details
 */
export const prisma_upsertResourceUserInventoryItem = async (
  data: OmitItemType<Prisma.ResourceUserInventoryItemUncheckedCreateInput>,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"RESOURCE">> => {
  logger.debug(data, `prisma_upsertResourceUserInventoryItem()`);

  const safeUpdateData: Prisma.ResourceUserInventoryItemUpdateInput &
    Prisma.ResourceUserInventoryItemCreateInput = {
    user: {
      connect: {
        id: data.userId,
      },
    },
    item: {
      connect: {
        id: data.resourceId,
      },
    },
    quantity: data.quantity,
  };

  return (await prismaClient.resourceUserInventoryItem.upsert({
    where: {
      userId_resourceId: {
        userId: data.userId,
        resourceId: data.resourceId,
      },
    },
    update: safeUpdateData,
    create: safeUpdateData,
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">;
};

/**
 * ### Updates or Creates a HarvesterUserInventoryItem for a user
 * - The `data` param requires all the properties necessary to create a new row
 * - The 'itemType' property cannot be included. We always use database default.
 *
 * @returns A `UserInventoryItemWithItem<"HARVESTER">` type which includes the item details
 */
export const prisma_upsertHarvesterUserInventoryItem = async (
  data: OmitItemType<Prisma.HarvesterUserInventoryItemUncheckedCreateInput>,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"HARVESTER">> => {
  return (await prismaClient.harvesterUserInventoryItem.upsert({
    where: {
      userId_harvesterId: {
        userId: data.userId,
        harvesterId: data.harvesterId,
      },
    },
    update: data,
    create: data,
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"HARVESTER">;
};

/**
 * ### Deletes a ResourceUserInventoryItem
 * - The `resourceId` references the PK of the Resource table
 * @returns A `UserInventoryItemWithItem<"RESOURCE">` type which includes the item details
 */
export const prisma_deleteResourceUserInventoryItem = async (
  resourceId: string,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"RESOURCE">> => {
  return (await prismaClient.resourceUserInventoryItem.delete({
    where: {
      userId_resourceId: {
        userId,
        resourceId,
      },
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"RESOURCE">;
};

/**
 * ### Deletes a HarvesterUserInventoryItem
 * - The `harvesterId` references the PK of the Harvester table
 * @returns A `UserInventoryItemWithItem<"HARVESTER">` type which includes the item details
 */
export const prisma_deleteHarvesterUserInventoryItem = async (
  harvesterId: string,
  userId: string,
  prismaClient: PrismaClientOrTransaction = prisma,
): Promise<UserInventoryItemWithItem<"HARVESTER">> => {
  return (await prismaClient.harvesterUserInventoryItem.delete({
    where: {
      userId_harvesterId: {
        userId,
        harvesterId,
      },
    },
    include: {
      item: true,
    },
  })) as UserInventoryItemWithItem<"HARVESTER">;
};
