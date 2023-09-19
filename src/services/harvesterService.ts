import { Harvester } from "@prisma/client";
import {
  getHarvesterById,
  getHarvestersByUserId,
  updateHarvesterById,
} from "../queries/queryHarvester";
import {
  addOrUpdateUserInventoryItem,
  getInventoryItemFromUserInventoryItem,
  removeUserInventoryItemByItemId,
} from "./userInventoryService";
import { prisma } from "../prisma";
import { TRPCError } from "@trpc/server";

/**
 * ### Gets a Harvester
 *
 * **Throws** error if harvester is not found.
 * @param harvesterId
 * @returns
 */
export const getHarvester = async (harvesterId: string) => {
  return await getHarvesterById(harvesterId);
};

/**
 * ### Gets all harvesters owned by the user
 * Includes both *deployed* and *non-deployed*
 * @param userId
 * @returns
 */
export const getHarvestersForUser = async (userId: string) => {
  return await getHarvestersByUserId(userId);
};

/**
 * ### Gets all deployed harvesters owned by the user
 * @param userId
 * @returns
 */
export const getDeployedHarvestersForUser = async (userId: string) => {
  const harvesters = await getHarvestersForUser(userId);

  return harvesters.filter((harvester) => {
    return isHarvesterDeployed(harvester);
  });
};

/**
 * ### Checks if Harvester is currently deployed
 * Will **throw** error is Harvester does not exist.
 *
 * Returns true if Harvester has non-null `h3Index` and `deployedDate`
 * @param harvester
 * @returns
 */
export const isHarvesterDeployed = (harvester: Harvester) => {
  return harvester.deployedDate != null && harvester.h3Index != null;
};

/**
 * ### Handles harvester deployment to a harvestRegion
 *
 * Will throw TRPCError if:
 * - harvesterId is not found (error=NOT_FOUND)
 * - harvester is already deployed (error=CONFLICT)
 * - harvestRegion already has a deployed harvester by this user (error=CONFLICT)
 */
export const handleDeploy = async (
  harvesterId: string,
  harvestRegion: string,
) => {
  let harvester: Harvester;

  try {
    harvester = await getHarvester(harvesterId);
  } catch (error) {
    throw new TRPCError({
      message: `harvesterId: ${harvesterId} not found`,
      code: "NOT_FOUND",
    });
  }

  // Harvester should not be already deployed
  if (isHarvesterDeployed(harvester)) {
    throw new TRPCError({
      message: `harvesterId: ${harvesterId} has invalid state (seems it is already deployed?)`,
      code: "CONFLICT", // 409
    });
  }

  // This location cannot already have a harvester owned by this user
  const userDeployedHarvesters = await getDeployedHarvestersForUser(
    harvester.userId,
  );
  if (userDeployedHarvesters.some((udh) => udh.h3Index === harvestRegion)) {
    throw new TRPCError({
      message: `harvestRegion: ${harvestRegion} already contains a harvester owned by this user`,
      code: "CONFLICT", // 409
    });
  }

  await updateHarvesterById(harvester.id, {
    deployedDate: new Date(),
    h3Index: harvestRegion,
  });

  // Remove the harvester from the user's inventory
  await removeUserInventoryItemByItemId(
    harvester.id,
    "HARVESTER",
    harvester.userId,
  );
};

/**
 * ### handleCollect
 * ! TODO: In Progress.
 * - Find the HarvestOperations associated with this Harvester
 * - Calculate the amount of resources harvested
 * - Update the UserInventoryItem table
 *
 * @param userId
 * @param harvesterId
 */
export const handleCollect = async (userId: string, harvesterId: string) => {
  /*
    Let's pretend the Harvester has a HarvestOperation that reports 50 of Gold
    */
  // Update the UserInventoryItem table to add or update this Resource for this user
  // !EXPERIMENTAL - using test data for now
  const testUser = await prisma.user.findUnique({
    where: {
      email: "testUser@gmail.com",
    },
  });

  const copper = await prisma.resource.findUnique({
    where: {
      url: "copper",
    },
  });

  if (!copper || !testUser) {
    throw Error("Error in handleCollect");
  }

  // Perform the user inventory update
  const resultUserInventoryItem = await addOrUpdateUserInventoryItem(
    copper.id,
    "RESOURCE",
    testUser.id,
    50,
  );
  // Return a client facing InventoryItem
  // TODO: will need to return an array of InventoryItems for multiple collected resources...
  return await getInventoryItemFromUserInventoryItem(resultUserInventoryItem);
};

/**
 * ### Picks up the harvester and puts it back in the user's inventory
 * - Will also perform `handleCollect()`, i.e. collect all resources in the harvester (HarvestOperations)
 * and add those to the user's inventory
 * @param harvesterId
 */
export const handleReclaim = async (harvesterId: string) => {
  // get the harvester's user (owner)
  const { userId } = await getHarvesterById(harvesterId);

  /**
   * TODO: Need to calculate how much remaining energy and which energy item to return to the user
   * Currently, just clearing the energy data on reclaim
   */

  // remove the deployed status and energy data from the harvester
  await updateHarvesterById(harvesterId, {
    deployedDate: null,
    h3Index: null,
    initialEnergy: null,
    energyStartTime: null,
    energyEndTime: null,
    energySourceId: null,
  });

  // add the harvester item back to the user's (owner) inventory
  await addOrUpdateUserInventoryItem(harvesterId, "HARVESTER", userId, 1);
};
