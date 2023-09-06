import { Harvester } from "@prisma/client";
import { getHarvesterById } from "../queries/queryHarvester";
import { addOrUpdateUserInventoryItem } from "./userInventoryService";
import { prisma } from "../prisma";

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
 *
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
    Let's pretend the Harvester has a HarvestOperation that reports 10 of Gold
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

  await addOrUpdateUserInventoryItem(copper.id, "RESOURCE", testUser.id, 50);
};
