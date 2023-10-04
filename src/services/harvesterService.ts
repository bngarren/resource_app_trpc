import { arcaneEnergyResourceMetadataSchema } from "./../schema/index";
import { getAllSettled } from "./../util/getAllSettled";
import {
  Harvester,
  ItemType,
  Resource,
  ResourceType,
  SpawnedResource,
} from "@prisma/client";
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
import { createHarvestOperationsTransaction } from "../queries/queryHarvestOperation";
import config from "../config";
import { getSpawnRegionsAround } from "../util/getSpawnRegionsAround";
import { getSpawnedResourcesForSpawnRegion } from "../queries/queryResource";
import { getDistanceBetweenCells } from "../util/getDistanceBetweenCells";
import { logger } from "../logger/logger";
import { getResource } from "./resourceService";
import { addMilliseconds, getTime } from "date-fns";
import { validateWithZod } from "../util/validateWithZod";

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

  // Update the Harvester to show as deployed
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

  // Create new harvest operations based on the interactable spawned resources near this harvester

  /**
   * Similar to handleScan, we find all the spawnRegions nearby the harvester
   *
   * TODO: The scan_distance is used to capture all the spawn regions that were also captured in the scan
   * This distance isn't strictly accurate, we just want to encompass all possible resources for now, then
   * we will filter them out based on how far they are from the harvestRegion center
   */
  const { spawnRegions } = await getSpawnRegionsAround(
    harvestRegion,
    config.scan_distance,
  );

  // Get spawned resources for each spawn region and filter by user_interact_distance (from config)
  const harvestableSpawnedResources = await getAllSettled<SpawnedResource[]>(
    spawnRegions.map((spawnRegion) => {
      return getSpawnedResourcesForSpawnRegion(spawnRegion.id);
    }),
  ).then((res) =>
    // take the array of arrays and flatten into single array and then filter for distance
    res
      .flat()
      .filter(
        (resource) =>
          getDistanceBetweenCells(resource.h3Index, harvestRegion) <=
          config.user_interact_distance,
      ),
  );

  // Create a HarvestOperation for each nearby SpawnedResource
  const harvestOperations = await newHarvestOperationsForHarvester(
    harvesterId,
    harvestableSpawnedResources.map((i) => i.id),
  );

  // ! DEBUG
  logger.debug(
    harvestOperations,
    `Created ${harvestOperations?.length} harvest operations within handleDeploy()`,
  );

  return harvestOperations;
};

/**
 * ### Gives the amount of energy left in the harvester
 * - If remaining energy calculation would be negative, this will return ZERO
 * #### Example
 * If initialEnergy of 10 units has run for 3 hours at 0.6 energyEfficiency,
 * this would leave 10units - 180 min/36 min per unit = 5 units remaining.
 * @param initialEnergy - the amount of energy in the harvest at the start time
 * @param minutesLapsed - time since the start time, in minutes (keep floating point precision)
 * @param energyEfficiency - the energy efficiency (from the metadata)
 * @returns amount of energy (units), float
 */
export const calculateRemainingEnergy = (
  initialEnergy: number,
  minutesLapsed: number,
  energyEfficiency: number,
) => {
  // Remaining energy is the initialEnergy minus what was used over the period of time
  //  If it ran out already, this may be negative so we make it zero
  return Math.max(
    0,
    initialEnergy -
      minutesLapsed /
        (config.base_minutes_per_arcane_energy_unit * energyEfficiency +
          0.000001), // maintain float
  );
};

/**
 * ### Updates the Harvester with additional energy of a specific type
 * This will trigger an update of all the harvester's HarvestOperations based on the new
 * energyEndTime
 *
 * It is crucial that we maintain floating point precision in these calculations
 *
 * #### Throws errors:
 * - If energySourceId doesn't locate a Resource in the database, by id - throws NOT_FOUND
 * - If energySourceId doesn't represent an Arcane Energy Resource, by id - throws NOT_FOUND
 * - If the resource metadata isn't valid with regards to our Zod schema, will throw generic Error
 * - If the energySourceId is different than the pre-existing energy in the harvester - throws CONFLICT
 *
 * @param _harvester - either pass the harvesterId or the Harvester
 * @param amount
 * @param energySourceId
 */
export const handleAddEnergy = async (
  _harvester: string | Harvester,
  amount: number,
  energySourceId: string,
) => {
  /*
  ! TODO: WIP
  - [X] Based on the energy source type's metadata, calculate how long a unit of energy will last
  - [X] Calculate the expected energy end time
  - [X] Update the harvester with the energyStartTime (now), energyEndTime, and initialEnergy (amount)
  - [X] Also update the harvester with energySourceId (if this is first energy)
  - [ ] Run updateHarvestOperationsForHarvester(energyEndTime)
  */

  let energyResource: Resource;
  try {
    energyResource = await getResource(energySourceId);
  } catch (error) {
    throw new TRPCError({
      message: `Couldn't find Resource with id=${energySourceId}`,
      code: "NOT_FOUND",
    });
  }

  // Check validity of this Resource (has to be an ARCANE_ENERGY resource type)
  if (energyResource.resourceType !== ResourceType.ARCANE_ENERGY) {
    throw new TRPCError({
      message: `Resource with id=${energySourceId} is not an Arcane Energy type`,
      code: "NOT_FOUND",
    });
  }

  // Extract the metadata information from the resource.
  //   We use Zod schema to verify that the metadata json returned from the database is what we expected
  const metadata = validateWithZod(
    arcaneEnergyResourceMetadataSchema,
    energyResource.metadata,
    `metadata for ${energyResource.url}`,
  );

  // Calculate minutesPerEnergyUnit
  const minutesPerEnergyUnit =
    config.base_minutes_per_arcane_energy_unit * metadata.energyEfficiency;

  // Get the harvester (either from passed in Harvester or from harvesterId)
  let harvester: Harvester;
  if (typeof _harvester === "string") {
    try {
      harvester = await getHarvester(_harvester);
    } catch (error) {
      throw new TRPCError({
        message: `harvester: ${_harvester}`,
        code: "NOT_FOUND",
      });
    }
  } else {
    harvester = _harvester;
  }

  // Verify that the energy type being added is the same as what is already in the harvester, if present
  // This step is also checked at the TRPC router level, but good to check here as well
  if (
    harvester.energySourceId != null &&
    harvester.energySourceId !== energyResource.id
  ) {
    throw new TRPCError({
      message: `Cannot add energy of a different type to this harvester (${harvester.energySourceId} !== ${energyResource.id})`,
      code: "CONFLICT",
    });
  }

  /* New energy start time is now.
  - When energy is added to the harvester, we recalculate the initialEnergy and new
  energyStartTime and energyEndTime
  */
  const newEnergyStartTime = new Date();

  // If harvester already had energy, calculate the remaining amount
  let remainingEnergy: number;
  if (harvester.initialEnergy > 0) {
    remainingEnergy = harvester.initialEnergy;

    // If energy has been used (i.e., harvester has an energyStartTime), calculate this duration
    if (harvester.energyStartTime != null) {
      // Use milliseconds to get best resolution, e.g., user adds energy very quickly after last energyStartTime
      const minutesLapsed =
        (getTime(newEnergyStartTime) - getTime(harvester.energyStartTime)) /
          60000 +
        0.000001; // milliseconds to minutes

      // Remaining energy is the initialEnergy minus what was used over the period of time
      //  If it ran out already, this may be negative so we make it zero
      remainingEnergy = calculateRemainingEnergy(
        harvester.initialEnergy,
        minutesLapsed,
        metadata.energyEfficiency,
      );
    }
  } else {
    remainingEnergy = 0.0;
  }

  // Calculate the new initialEnergy (remainingEnergy + addedEnergy)
  const newInitialEnergy = remainingEnergy + amount;

  // Calculate the newEnergyEndTime
  const newEnergyEndTime = addMilliseconds(
    newEnergyStartTime,
    newInitialEnergy * minutesPerEnergyUnit * 60000.0,
  );

  // Update the harvester with new energy data
  const res = await updateHarvesterById(harvester.id, {
    initialEnergy: newInitialEnergy,
    energyStartTime: newEnergyStartTime,
    energyEndTime: newEnergyEndTime,
    energySourceId: energyResource.id,
  });

  // TODO: Update each harvest operation with new energyEndTime

  return res;
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
 * - The "user" is assumed to be the harvester's owner (userId)
 * - Will return unused/remaining energy to the user's inventory
 *   - **Important**: Remaining energy is rounded DOWN, such that 4.8 units in the harvester
 * will return 4 units to the user's inventory.
 *   - The client side should adjust it's display value to reflect this
 * - Will also perform `handleCollect()`, i.e. collect all resources in the harvester (HarvestOperations)
 * and add those to the user's inventory
 * - Will remove all HarvestOperations associated with the Harvester
 * @param harvesterId
 */
export const handleReclaim = async (harvesterId: string) => {
  // get the harvester's user (owner)
  const harvester = await getHarvesterById(harvesterId);

  /**
   * Need to calculate how much remaining energy and which energy item to return to the user
   *
   * See `handleAddEnergy()` for details on energy calculations, which are mirrored below
   */
  if (harvester.energySourceId != null) {
    const energyResource = await getResource(harvester.energySourceId);

    const metadata = validateWithZod(
      arcaneEnergyResourceMetadataSchema,
      energyResource.metadata,
      `metadata for ${energyResource.url}`,
    );

    // If harvester already had energy, calculate the remaining amount
    let remainingEnergy = 0.0;
    if (harvester.initialEnergy > 0) {
      remainingEnergy = harvester.initialEnergy;

      // If energy has been used (i.e., harvester has an energyStartTime), calculate this duration
      if (harvester.energyStartTime != null) {
        // Use milliseconds to get best resolution
        const minutesLapsed =
          (getTime(new Date()) - getTime(harvester.energyStartTime)) / 60000 +
          0.000001; // milliseconds to minutes

        // Remaining energy is the initialEnergy minus what was used over the period of time
        //  If it ran out already, this may be negative so we make it zero
        remainingEnergy = calculateRemainingEnergy(
          harvester.initialEnergy,
          minutesLapsed,
          metadata.energyEfficiency,
        );
      }
    }

    // add the energy resource item back to the user's (owner) inventory
    // *We round the remaining energy DOWN to an integer
    await addOrUpdateUserInventoryItem(
      energyResource.id,
      ItemType.RESOURCE,
      harvester.userId,
      Math.floor(remainingEnergy),
    );
  }

  // remove the deployed status and energy data from the harvester
  await updateHarvesterById(harvesterId, {
    deployedDate: null,
    h3Index: null,
    initialEnergy: 0.0,
    energyStartTime: null,
    energyEndTime: null,
    energySourceId: null,
  });

  // add the harvester item back to the user's (owner) inventory
  await addOrUpdateUserInventoryItem(
    harvesterId,
    "HARVESTER",
    harvester.userId,
    1,
  );

  // TODO: need to perform handleCollect() to get all resources from harvester
  // TODO: need to remove all HarvestOperations associated with this harvester
};

/**
 * ### Creates new HarvestOperations for a Harvester based on given SpawnedResources
 * @param harvesterId
 * @param spawnedResourceIds
 */
const newHarvestOperationsForHarvester = async (
  harvesterId: string,
  spawnedResourceIds: string[],
) => {
  // Ensure there is at least 1 SpawnedResource to make 1 HarvestOperation
  if (spawnedResourceIds.length < 1) {
    logger.warn(
      `Cannot make new HarvestOperations with ${spawnedResourceIds.length} spawnedResources.`,
    );
    return [];
  }

  const res = await createHarvestOperationsTransaction({
    harvesterId,
    spawnedResourceIds,
  });

  if (res === null) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
    });
  } else {
    return res;
  }
};
