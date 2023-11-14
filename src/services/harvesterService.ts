import { SpawnedResourceWithResource } from "./../types/index";
import {
  prisma_getHarvestOperationsWithResetDateForHarvesterId,
  prisma_getHarvestOperationsWithSpawnedResourceForHarvesterId,
} from "./../queries/queryHarvestOperation";
import { pdate, pduration } from "../util/getPrettyDate";
import { getAllSettled } from "./../util/getAllSettled";
import {
  HarvestOperation,
  Harvester,
  ItemType,
  Resource,
  ResourceType,
  SpawnedResource,
  Prisma,
} from "@prisma/client";
import {
  prisma_getHarvesterById,
  prisma_getHarvestersByUserId,
  prisma_updateHarvesterById,
} from "../queries/queryHarvester";
import {
  updateCreateOrRemoveUserInventoryItemWithNewQuantity,
  validateUserInventoryItemTransfer,
  removeUserInventoryItemByItemId,
  getResourceUserInventoryItemByUrl,
} from "./userInventoryService";
import { TRPCError } from "@trpc/server";
import {
  prisma_createHarvestOperationsTransaction,
  prisma_deleteHarvestOperationsForHarvesterId,
  prisma_getHarvestOperationsForHarvesterId,
  prisma_updateHarvestOperationsTransaction,
} from "../queries/queryHarvestOperation";
import config from "../config";
import { getSpawnRegionsAround } from "../util/getSpawnRegionsAround";
import { prisma_getSpawnedResourcesForSpawnRegion } from "../queries/queryResource";
import { getDistanceBetweenCells } from "../util/getDistanceBetweenCells";
import { logger } from "../main";
import { getResource } from "./resourceService";
import {
  addMilliseconds,
  differenceInMilliseconds,
  getTime,
  isAfter,
  isBefore,
  min,
} from "date-fns";
import { SagaBuilder } from "../util/saga";
import { prefixedError } from "../util/prefixedError";
import { ArcaneEnergyResource, UserInventoryItemWithItem } from "../types";

/**
 * ### Gets a Harvester
 *
 * **Throws** error if harvester is not found.
 * @param harvesterId
 * @returns
 */
export const getHarvester = async (harvesterId: string) => {
  return await prisma_getHarvesterById(harvesterId);
};

/**
 * ### Gets all harvesters owned by the user
 * Includes both *deployed* and *non-deployed*
 * @param userId
 * @returns
 */
export const getHarvestersForUser = async (userId: string) => {
  return await prisma_getHarvestersByUserId(userId);
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
 * ### Returns all HarvestOperations for a harvester
 * - May return empty []
 * ---
 * - If you want to include the **resetDate** of the associated SpawnedResource's SpawnRegion,
 * use `getHarvestOperationsWithResetDateForHarvester()`
 *
 * - If you want to include the **SpawnedResource** of associated with this HarvestOperation,
 * use `getHarvestOperationsWithSpawnedResourceForHarvester()`
 */
export const getHarvestOperationsForHarvester = async (harvesterId: string) => {
  return await prisma_getHarvestOperationsForHarvesterId(harvesterId);
};

/**
 * ### Returns all HarvestOperations for a harvester (special), each with the Spawned Resource
 * - May return empty []
 *
 * Each HarvestOperation **includes a `spawnedResource` property** which is a `SpawnedResourceWithResource` type.
 *
 * See `getHarvestOperationsForHarvester()` for other variations.
 */
export const getHarvestOperationsWithSpawnedResourceForHarvester = async (
  harvesterId: string,
) => {
  return await prisma_getHarvestOperationsWithSpawnedResourceForHarvesterId(
    harvesterId,
  );
};

/**
 * ### Returns all harvest operations for a harvester (special), each with resetDate
 * - May return empty []
 *
 * Each HarvestOperation **includes the `resetDate` property** from the associated spawned resource's spawn region.
 * This is useful for when looping through harvest operations looking for when a
 * harvested resource could be/would be stale or depleted.
 */
export const getHarvestOperationsWithResetDateForHarvester = async (
  harvesterId: string,
) => {
  return await prisma_getHarvestOperationsWithResetDateForHarvesterId(
    harvesterId,
  );
};

/**
 * ### Removes all harvest operations associated with a harvester
 * @param harvesterId
 * @returns
 */
export const removeHarvestOperationsForHarvester = async (
  harvesterId: string,
) => {
  return await prisma_deleteHarvestOperationsForHarvesterId(harvesterId);
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
    logger.error({ [config.logger_error_key]: error, harvesterId });
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
  await prisma_updateHarvesterById(harvester.id, {
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

  // Get active spawned resources for each spawn region and filter by user_interact_distance (from config)
  const harvestableSpawnedResources = await getAllSettled<SpawnedResource[]>(
    spawnRegions.map((spawnRegion) => {
      return prisma_getSpawnedResourcesForSpawnRegion(spawnRegion.id);
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
    { harvestOperations },
    `Created ${harvestOperations?.length} harvest operations within handleDeploy()`,
  );

  return harvestOperations;
};

/**
 * ### Returns the amount of resource harvested by this operation since its startTime
 * Will throw error if the HarvestOperation does not have an endTime
 *
 * This calculation is performed by finding the time elapsed since the startTime and
 * either the endTime or `asOf` time (which is usually the current time), whichever is earlier.
 *
 * I.e., if we are checking _before_ the endTime, we will use the current time instead.
 * @param harvestOperation
 * @param asOf
 * @returns Amount of resource (can be decimal/float)
 */
const getAmountHarvestedByHarvestOperation = (
  harvestOperation: HarvestOperation,
  asOf = new Date(),
) => {
  if (harvestOperation.endTime == null) {
    throw new Error(
      `HarvestOperation (id=${harvestOperation.id}) should already have an endTime but is NULL. Cannot getAmountHarvestedByHarvestOperation().`,
    );
  }
  // The left limit is the startTime.
  // If startTime is null, we set it to `asOf`, which should make the duration 0
  const leftLimit = harvestOperation.startTime ?? asOf;
  // The right limit is either the endTime or asOf time (current)
  const rightLimit = min([asOf, harvestOperation.endTime]);

  // TODO: need to add in harvester extraction rate/yield or other bonuses

  const amountHarvested = calculatePeriodHarvested(leftLimit, rightLimit);

  logger.debug(
    {
      harvestOperationId: harvestOperation.id,
      asOf: pdate(asOf),
      "harvestOperation.endTime": pdate(harvestOperation.endTime),
      leftLimit: pdate(leftLimit),
      rightLimit: pdate(rightLimit),
      periodDuration: pduration(
        differenceInMilliseconds(rightLimit, leftLimit),
      ),
      amountHarvested,
    },
    `getAmountHarvestedByHarvestOperation() - complete`,
  );

  return amountHarvested;
};

/**
 * ### Updates each harvest operation of a harvester based on given energy start and end times
 *
 * Updating a harvest operation with new `energyEndTime` will attempt to generate a
 * new `startTime` and recalculate an `endTime` and `priorHarvested` amount.
 *
 * It's like saying here is more energy...Store the amount harvested from the
 * prior startTime to endTime duration, and now make a new startTime and endTime if this
 * harvest operation should continue
 *
 * - A new startTime is only created if it will occur BEFORE the new endTime
 *   - Thus, startTime will be set to null if endTime has already passed, i.e
 * resetDate is passed or no energy
 * - The new startTime defaults to current time, i.e. new Date()
 *   - However, we should pass the `energyStartTime` parameter from the calling function
 * in order to keep consistency.
 *   - This parameter is also used (**WITH CAUTION**) for manually dating harvest operations for testing purposes.
 *
 * #### Warning
 * The `harvesterId` can be used if only the string is needed. If the Harvester is retrieved, know
 * that it is not yet updated with new energy data. Use the passed in energy params instead!
 *
 * @param harvesterId
 * @param energyEndTime
 * @param energyStartTime
 */
const updateHarvestOperationsForHarvester = async (
  harvesterId: string,
  energyEndTime: Date,
  energyStartTime = new Date(),
) => {
  /* Since we know we will need the resetDate for each harvest operation, we eagerly request
  this along with our database query for each harvest operation
  */
  // special HarvestOperationWithResetDate[] type
  let harvestOperations =
    await prisma_getHarvestOperationsWithResetDateForHarvesterId(harvesterId);

  const totalHarvestOperations = harvestOperations.length;

  harvestOperations = harvestOperations.filter((ho) => !ho.isCompleted);

  logger.debug(
    {
      harvesterId,
      energyEndTime: pdate(energyEndTime),
      energyStartTime: pdate(energyStartTime),
    },
    `[func updateHarvestOperationsForHarvester] - begin.
    Harvest operations = ${harvestOperations.length} incomplete / ${totalHarvestOperations} total`,
  );

  // Loop through the incomplete (still had resource) harvest operations to get their spawn region's reset_date
  // to compare with the energyEndTime
  // We create an array of Promises then later await it
  const newHarvestOperationsPromises = [...harvestOperations].map(
    async (harvestOperation, index) => {
      /* To determine the new endTime, we compare the SpawnedResource's SpawnRegion's
      `resetDate` and the energyEndTime of the harvester, picking the earlier of the two */

      // Reforming a HarvestOperation from the special HarvestOperationWithResetDate type
      const { resetDate: spawnRegionResetDate, ...updatedHarvestOperation } =
        harvestOperation;

      if (spawnRegionResetDate == null) {
        throw new Error(
          `A harvest operation (id=${harvestOperation.id}) is associated with a SpawnedResource whose SpawnRegion has a NULL resetDate!`,
        );
      }

      // logger.debug(
      //   { harvestOperation, resetDate: pdate(spawnRegionResetDate) },
      //   `Updating HarvestOperation #${index + 1}...(this is pre):`,
      // );

      // Calculate the amount harvested for this prior period
      const amountHarvested = getAmountHarvestedByHarvestOperation(
        harvestOperation,
        energyStartTime,
      );

      // Add the prior period amount to the running priorHarvested amount stored in the harvest operation
      updatedHarvestOperation.priorHarvested += amountHarvested;

      // Update new startTime and endTimes
      // If newStartTime is AFTER the endTime, it is set to null (we don't start again but it is finished)

      // * Recalculate the endTime for this harvest operation
      // isBefore() returns a boolean, the first date is before the second date
      if (isBefore(spawnRegionResetDate, energyEndTime)) {
        updatedHarvestOperation.endTime = spawnRegionResetDate;
      } else {
        updatedHarvestOperation.endTime = energyEndTime;
      }

      // * If the endTime has already passed our energyStartTime, then we don't start.
      // isAfter() returns a boolean, the first date is after the second date
      if (isAfter(energyStartTime, updatedHarvestOperation.endTime)) {
        updatedHarvestOperation.startTime = null;

        // Is it because our resource is depleted?
        if (isAfter(energyStartTime, spawnRegionResetDate)) {
          updatedHarvestOperation.isCompleted = true;
          logger.debug(
            `HarvestOperation isCompleted=true. ${pdate(
              energyStartTime,
            )} is AFTER ${pdate(spawnRegionResetDate)}`,
          );
        } else {
          // Or is it because energy is 0? thus, energyEndTime has passed. But resource remains...
          logger.warn(
            {
              updatedHarvestOperation,
            },
            `HarvestOperation startTime=null. Is the harvester's energy at zero? Ensure this is not an error!`,
          );
        }
      } else {
        // Okay to give new startTime since it is BEFORE the endTime (there remains time to harvest)
        updatedHarvestOperation.startTime = energyStartTime;
      }

      return updatedHarvestOperation as HarvestOperation;
    },
  );

  const newHarvestOperations = await Promise.all(newHarvestOperationsPromises);

  const res = await prisma_updateHarvestOperationsTransaction(
    newHarvestOperations,
  );

  if (res != null) {
    // logger.debug(res, `Updated HarvestOperations`);
    return res;
  } else {
    throw new Error(
      `Unexpected problem within updateHarvestOperationsForHarvester() for harvesterId=${harvesterId}`,
    );
  }
};

export const calculatePeriodHarvested = (
  startTime: Date,
  endTime: Date,
  _extractionRate?: number,
) => {
  let extractionRate: number;
  if (_extractionRate == null) {
    extractionRate = config.base_units_per_minute_harvested;
  } else {
    extractionRate = _extractionRate;
  }

  return (
    (differenceInMilliseconds(endTime, startTime) / 60000.0) * extractionRate
  );
};

/**
 * ### Gives the amount of energy left in the harvester
 * - If remaining energy calculation would be negative, this will return ZERO
 * #### Example
 * If initialEnergy of 10 units has run for 3 hours at 0.6 energyEfficiency,
 * this would leave 10units - 180 min/36 min per unit = 5 units remaining.
 * @param initialEnergy - the amount of energy in the harvest at the start time
 * @param minutesLapsed - time since the start time, in minutes (keep floating point precision)
 * @param energyEfficiency - the energy efficiency
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
 * ### Verifies a resource id represents an actual Arcane Energy resource
 * **Throws error** if resource does not exist or is not Arcane Energy
 * @param resourceId
 * @returns Resource
 */
export const verifyArcaneEnergyResource = async (resourceId: string) => {
  let resource: Resource;
  try {
    resource = await getResource(resourceId);
  } catch (error) {
    logger.error(error);
    throw new TRPCError({
      message: `Couldn't find Resource with id=${resourceId}.`,
      code: "NOT_FOUND",
    });
  }

  // Check validity of this Resource (has to be an ARCANE_ENERGY resource type)
  if (resource.resourceType !== ResourceType.ARCANE_ENERGY) {
    throw new TRPCError({
      message: `Resource with id=${resourceId} is not an Arcane Energy type`,
      code: "NOT_FOUND",
    });
  }
  return resource as ArcaneEnergyResource;
};
/**
 * ### Adds or removes energy from Harvester
 * - This will trigger an update of all the harvester's HarvestOperations based on a fresh
 * calculation of when they started, what time this is called, and when we expect them to end.
 *
 * ---
 *
 * #### Caution with `amount` terminology:
 * The `amount` param for this function represents how much energy is added to the harvester.
 * In other words:
 * - Positive `amount` = energy added to harvester
 * - Negative `amount` = energy removed from harvester
 *
 * This is important, as the `updateCreateOrRemoveUserInventoryItemWithNewQuantity()` that is called
 * to update the user inventory uses the opposite of this amount to calculate the new inventory item
 * quantity. Such that, adding energy to a harvester would give a positive `amount` for this function
 * but use _negative_ of this \`amount\` for calculating the `newQuantity` for `updateCreateOrRemoveUserInventoryItemWithNewQuantity()`.
 *
 * ---
 *
 * #### Force a different time?
 * - If `atTime` is:
 *   - **null**: we default to using the current time within our logic. I.e., this is the time
 * at which the last energy period has now ended and the new period will begin. **This forms the basis for
 * how the HarvestOperations are updated** and harvested resource calculations are made.
 *   - **Date**: we use this passed date/time as the time to base our calculations. For example, this is
 * utilized for testing purposes.
 *
 * #### Should we use the player inventory?
 * - If `activeUserId` is:
 *   - **null**: do not use user inventory for energy transfer (god mode)
 *   - **undefined**: use the harvester owner's userId for user inventory transfer
 *   - **string**: use _this_ userId as the activeUserId for inventory transfer, which may be
 * different than the harvester owner (currently only for testing purposes)
 *
 * It is crucial that we maintain floating point precision in these calculations
 *
 * #### Throws errors:
 * - If energySourceId doesn't locate a Resource in the database, by id - throws NOT_FOUND
 * - If energySourceId doesn't represent an Arcane Energy Resource, by id - throws NOT_FOUND
 * - If the energySourceId is different than the pre-existing energy in the harvester - throws CONFLICT
 *
 * @param _harvester - either pass the harvesterId or the Harvester
 * @param amount - Positive when adding energy; Negative when removing energy
 * @param energySourceId
 * @param atTime - See above _Force a different time?_. Pass **null** to use current time.
 * @param activeUserId - See above _Should we use the player inventory?_. Pass **null**
 * specifically to use god mode.
 */
export const handleTransferEnergy = async (
  _harvester: string | Harvester,
  amount: number,
  energySourceId: string,
  atTime: Date | null,
  _activeUserId?: string | null,
) => {
  // for logging purposes
  const gerund = amount >= 0 ? "Adding" : "Removing";
  const verb = amount >= 0 ? "add" : "remove";

  // - - - - Get RESOURCE info - - - -
  const energyResource = await verifyArcaneEnergyResource(energySourceId);

  // Calculate minutesPerEnergyUnit
  const minutesPerEnergyUnit =
    config.base_minutes_per_arcane_energy_unit *
    energyResource.energyEfficiency;

  // - - - - - Get the Harvester - - - - -
  // Get the harvester (either from passed in Harvester or from harvesterId)
  let harvester: Harvester;
  if (typeof _harvester === "string") {
    try {
      harvester = await getHarvester(_harvester);
    } catch (error) {
      logger.error(error);
      throw new TRPCError({
        message: `harvester: ${_harvester}`,
        code: "NOT_FOUND",
      });
    }
  } else {
    harvester = _harvester;
  }

  // Verify that the energy type being added/removed is the same as what is already in the harvester, if present
  // This step is also checked at the TRPC router level, but good to check here as well
  if (
    harvester.energySourceId != null &&
    harvester.energySourceId !== energyResource.id
  ) {
    throw new TRPCError({
      message: `Cannot add/remove energy of a different type than what already exists in this harvester (${harvester.energySourceId} !== ${energyResource.id})`,
      code: "CONFLICT",
    });
  }

  // - - - - - UserInventory logic - - - - -
  // Only modify user inventory if NOT null
  const shouldUpdateUserInventory = _activeUserId !== null;
  // activeUserId defaults to harvester's owner unless specified by _activeUserId
  const activeUserId = _activeUserId != null ? _activeUserId : harvester.userId;

  // If we are going to use the user's inventory, we must first make some checks about
  // the user HAVING enough resource to do this, if necessary
  let orig_energyResourceUserInventoryItem: UserInventoryItemWithItem<"RESOURCE">;
  if (shouldUpdateUserInventory) {
    try {
      orig_energyResourceUserInventoryItem =
        await validateUserInventoryItemTransfer(
          energyResource.id,
          "RESOURCE",
          activeUserId,
          -amount, // Withdrawal amount is negative (compared to what we intend to place in harvester)
        );
      logger.debug(
        `✅ Validated user inventory item transfer, currently have ${orig_energyResourceUserInventoryItem.quantity} unit(s) of '${orig_energyResourceUserInventoryItem.item.url}' and plan to transfer ${amount} to the harvester.`,
      );
      // ...
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // If we failed to find the resource in the user's inventory...
        // P2025 = NOT FOUND ERROR
        if (err.code === "P2025" && amount < 0) {
          // This is okay. We are transfering energy from harvester to user (who isn't currently holding this resource...)
          logger.debug(
            `✅ Validated user inventory item transfer, will transfer ${amount} to user inventory which currently has none of this resource.`,
          );
        } else {
          throw prefixedError(
            err,
            `Failed to validate the user inventory item transfer`,
          );
        }
      }
    }
  }

  // - - - - - Energy Calculations - - - - -
  /* New energy start time is now, or whatever energyStartTime was passed as a param for testing purposes
  - When energy is added/removed from the harvester, we recalculate the initialEnergy and new
  energyStartTime and energyEndTime
  */
  const newEnergyStartTime = atTime || new Date();

  logger.debug(
    { energyStartTime: pdate(newEnergyStartTime) },
    `[func handleTransferEnergy] - begin (${verb.toUpperCase()})`,
  );

  // If harvester already had energy prior to this new modify, calculate the remaining amount
  let remainingEnergy: number;
  if (harvester.initialEnergy > 0) {
    remainingEnergy = harvester.initialEnergy;

    // If energy has been used (i.e., harvester has an energyStartTime), calculate this duration
    if (harvester.energyStartTime != null) {
      // Use milliseconds to get best resolution, e.g., user adds energy very quickly after last energyStartTime
      const minutesLapsed =
        (getTime(newEnergyStartTime) - getTime(harvester.energyStartTime)) /
          60000.0 +
        0.000001; // milliseconds to minutes

      // Remaining energy is the initialEnergy minus what was used over the period of time
      //  If it ran out already, this may be negative so we make it zero
      remainingEnergy = calculateRemainingEnergy(
        harvester.initialEnergy,
        minutesLapsed,
        energyResource.energyEfficiency,
      );
    }
  } else {
    remainingEnergy = 0.0;
  }

  // Calculate the new initialEnergy (remainingEnergy + addedEnergy)
  const newInitialEnergy = remainingEnergy + amount;

  if (newInitialEnergy < 0) {
    throw new TRPCError({
      message: `Resulting newInitialEnergy should not be negative! (is ${newInitialEnergy})`,
      code: "CONFLICT",
    });
  }

  // Calculate the newEnergyEndTime
  const newEnergyEndTime = addMilliseconds(
    newEnergyStartTime,
    newInitialEnergy * minutesPerEnergyUnit * 60000.0,
  );

  const absAmount = Math.abs(amount);
  logger.debug(
    `${gerund} ${absAmount} unit${absAmount === 1 ? "" : "s"} of ${
      energyResource.name
    } will ${verb} ${pduration(
      absAmount * minutesPerEnergyUnit * 60000.0,
    )} of energy,
    giving total energy duration of ${pduration(
      newInitialEnergy * minutesPerEnergyUnit * 60000.0,
    )}.`,
  );

  // - - - - - Saga setup - - - - -
  const orig_harvestOperations = await getHarvestOperationsForHarvester(
    harvester.id,
  );

  const handleTransferEnergySaga = new SagaBuilder("handleTransferEnergySaga")
    .withLogger()
    // handleTransferEnergySaga STEP 1
    .invoke(async () => {
      const updatedHarvestOperations =
        await updateHarvestOperationsForHarvester(
          harvester.id,
          newEnergyEndTime,
          newEnergyStartTime,
        );

      if (
        updatedHarvestOperations.filter((ho) => !ho.isCompleted).length === 0
      ) {
        logger.warn(
          `Modified energy (${verb}) in a harvester with 0 incompleted (available) harvest operations. All resources are likely depleted.`,
        );
      }

      return updatedHarvestOperations;
    }, "updateHarvestOperationsForHarvester")
    .withCompensation(async () => {
      return await prisma_updateHarvestOperationsTransaction(
        orig_harvestOperations,
      );
    })
    // handleTransferEnergySaga STEP 2
    .invoke(async () => {
      // Update the harvester with new energy data
      return await prisma_updateHarvesterById(harvester.id, {
        initialEnergy: newInitialEnergy,
        energyStartTime: newEnergyStartTime,
        energyEndTime: newEnergyEndTime,
        energySourceId: energyResource.id,
      });
    }, "updateHarvesterById")
    .withCompensation(async () => {
      return await prisma_updateHarvesterById(harvester.id, {
        initialEnergy: harvester.initialEnergy,
        energyStartTime: harvester.energyStartTime,
        energyEndTime: harvester.energyEndTime,
        energySourceId: harvester.energySourceId,
      });
    })
    // handleTransferEnergySaga STEP 3
    .when(shouldUpdateUserInventory)
    .invoke(async () => {
      /* Careful: the "amount" we update the user inventory is the opposite sign of 
      what is transferred to/from the harvester 
      
      `orig_energyResourceUserInventoryItem` can be null if we are moving energy from the 
      harvester to the user inventory which does not currently have this resource.

      Boolean logic below:
      - If orig_energyResourceUserInventoryItem exists, pass 'orig_energyResourceUserInventoryItem.quantity - amount',
      which should not be negative (based on validateUserInventoryItemTransfer above)
      - If orig_energyResourceUserInventoryItem doesn't exist, it's okay if we are moving energy INTO
      the user's inventory (amount > 0)
      - If amount < 0, this should be an error.
      */

      let newQuantity: number;

      if (orig_energyResourceUserInventoryItem) {
        newQuantity = Math.max(
          0,
          orig_energyResourceUserInventoryItem.quantity - amount,
        );
      } else if (amount > 0) {
        newQuantity = amount;
      } else {
        throw new Error(
          "Trying to remove energy from a user inventory that doesn't have it. This shouldn't have passed validateUserInventoryItemTransfer()??",
        );
      }

      return await updateCreateOrRemoveUserInventoryItemWithNewQuantity(
        energyResource.id,
        ItemType.RESOURCE,
        activeUserId,
        newQuantity,
      );
    }, "update user's inventory")
    .withCompensation(async () => {
      // We either pass the original quantity if the item had existed, or
      // we pass 0 quantity to remove the item
      return await updateCreateOrRemoveUserInventoryItemWithNewQuantity(
        energyResource.id,
        ItemType.RESOURCE,
        activeUserId,
        orig_energyResourceUserInventoryItem?.quantity || 0,
      );
    })
    .build();

  // - - - - - Execute Saga to make database updates - - - - -
  try {
    const sagaResult = await handleTransferEnergySaga.execute();

    logger.info(
      {
        newInitialEnergy,
        newEnergyStartTime: pdate(newEnergyStartTime),
        newEnergyEndTime: pdate(newEnergyEndTime),
      },
      `handleTransferEnergy() - complete (${verb.toUpperCase()}). Updated Harvester:`,
    );

    // - - - - - RETURN - - - - -
    return sagaResult[1] as Harvester; // output from the second step
  } catch (error) {
    // TODO: how should we handle any error thrown from the saga? It may or may not have been rolled back successfully...
    throw error;
  }
};

/**
 * ### handleCollect
 * ! TODO: In Progress.
 * - Find the HarvestOperations associated with this Harvester
 * - Calculate the amount of resources harvested
 * - Saga
 *   - Update the UserInventoryItem table
 *   - Create new harvest operations based on same spawned resources
 *   - Remove old harvest operations
 * - Return user inventory items that were added
 *
 * ---
 *
 * #### Force a different time?
 * - If `atTime` is:
 *   - **null**: we default to using the current time within our logic. **This forms the basis for
 * how the HarvestOperations are "ended" and harvested resource calculations are made.
 *   - **Date**: we use this passed date/time as the time to base our calculations. For example, this is
 * utilized for testing purposes.
 *
 * @param userId
 * @param harvesterId
 */
export const handleCollect = async (
  userId: string,
  harvesterId: string,
  atTime?: Date,
) => {
  logger.debug({ userId, harvesterId, atTime }, `[func handleCollect]`);

  // - - - - - Get the Harvester - - - - -
  let harvester: Harvester;
  try {
    harvester = await getHarvester(harvesterId);
  } catch (error) {
    logger.error(error);
    throw new TRPCError({
      message: `harvesterId: ${harvesterId}`,
      code: "NOT_FOUND",
    });
  }

  // - - - - - Saga setup - - - - -
  // Get the harvest operations for this harvester
  const orig_harvestOperationsWithSpawnedResource =
    await getHarvestOperationsWithSpawnedResourceForHarvester(harvester.id);

  // A HarvestedOp stores info about a completed HarvestOperation
  type HarvestedOp = {
    harvestOperationId: string;
    spawnedResource: SpawnedResourceWithResource;
    harvestedAmount: number;
  };

  /**
   * An array of our HarvestOperation id's along with the SpawnedResource they harvested and the amount
   */
  const harvestedOps: HarvestedOp[] = [];

  // This is the time we will say is the end of the harvest operation (collect up until this time)
  const asOf = atTime ?? new Date();

  const orig_harvestOperations = orig_harvestOperationsWithSpawnedResource.map(
    (harvestOperationWithSpawnedResource) => {
      // Pull out the spawned resource
      const { spawnedResource, ..._harvestOperation } =
        harvestOperationWithSpawnedResource;

      // Reconstitute a HarvestOperation type
      const harvestOperation: HarvestOperation = {
        ..._harvestOperation,
        spawnedResourceId: spawnedResource.id,
      };

      const amt = getAmountHarvestedByHarvestOperation(harvestOperation, asOf);

      harvestedOps.push({
        harvestOperationId: harvestOperation.id,
        spawnedResource,
        harvestedAmount: amt,
      });

      return harvestOperation;
    },
  );

  // Store the user's current inventory items for these resources (if they exist), in case we roll back
  const orig_resourceUserInventoryItems: UserInventoryItemWithItem<"RESOURCE">[] =
    [];

  for (const harvestedOp of harvestedOps) {
    try {
      const res = await getResourceUserInventoryItemByUrl(
        harvestedOp.spawnedResource.resource.url,
        userId,
      );
      orig_resourceUserInventoryItems.push(res);
    } catch (err) {
      // Handle or log the error here if needed
    }
  }

  const handleCollectSaga = new SagaBuilder("handleCollect")
    .withLogger()
    // handleCollectSaga STEP 1
    .invoke(async () => {
      // Update ResourceUserInventoryItems
      const updatePromises = harvestedOps.map((harvestedOp) => {
        const resource = harvestedOp.spawnedResource.resource;

        return updateCreateOrRemoveUserInventoryItemWithNewQuantity(
          resource.id,
          "RESOURCE",
          userId,
          harvestedOp.harvestedAmount,
        );
      });

      return await Promise.all(updatePromises);
    }, "update user inventory items")
    .withCompensation(async () => {
      // Remove previously added
      /*
      await Promise.all(
        harvestedOps.map((harvestedOp) => {
          return removeUserInventoryItemByItemId(
            harvestedOp.spawnedResource.id,
            "RESOURCE",
            userId,
          );
        }),
      );

      // Recreate the original items
      return await Promise.all(
        orig_resourceUserInventoryItems.map(
          (orig_resourceUserInventoryItem) => {
            const { item: _item, ...resourceUserInventoryItem } =
              orig_resourceUserInventoryItem;

            return addResourceToUserInventory(resourceUserInventoryItem);
          },
        ),
      );
      */
    })
    .build();

  // - - - - - Execute Saga to make database updates - - - - -
  try {
    const sagaResult = await handleCollectSaga.execute();

    // - - - - - RETURN - - - - -
    return sagaResult[0] as UserInventoryItemWithItem<"RESOURCE">[]; // output from the first step
  } catch (error) {
    // TODO: how should we handle any error thrown from the saga? It may or may not have been rolled back successfully...
    throw error;
  }
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
  const harvester = await prisma_getHarvesterById(harvesterId);

  /**
   * Need to calculate how much remaining energy and which energy item to return to the user
   *
   * See `handleTransferEnergy()` for details on energy calculations, which are mirrored below
   */
  if (harvester.energySourceId != null) {
    const energyResource = await verifyArcaneEnergyResource(
      harvester.energySourceId,
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
          energyResource.energyEfficiency,
        );
      }
    }

    // add the energy resource item back to the user's (owner) inventory
    // *We round the remaining energy DOWN to an integer
    await updateCreateOrRemoveUserInventoryItemWithNewQuantity(
      energyResource.id,
      ItemType.RESOURCE,
      harvester.userId,
      Math.floor(remainingEnergy),
    );
  }

  // remove the deployed status and energy data from the harvester
  await prisma_updateHarvesterById(harvesterId, {
    deployedDate: null,
    h3Index: null,
    initialEnergy: 0.0,
    energyStartTime: null,
    energyEndTime: null,
    energySourceId: null,
  });

  // add the harvester item back to the user's (owner) inventory
  await updateCreateOrRemoveUserInventoryItemWithNewQuantity(
    harvesterId,
    "HARVESTER",
    harvester.userId,
    1,
  );

  // TODO: need to perform handleCollect() to get all resources from harvester

  // Finally, remove all harvest operations for this harvester
  // *Make sure that resources have been collected first (as this relies on the harvest operations!)
  await removeHarvestOperationsForHarvester(harvesterId);
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

  const res = await prisma_createHarvestOperationsTransaction({
    harvesterId,
    spawnedResourceIds,
  });

  if (res === null) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to create new harvest operations for harvesterId=${harvesterId}`,
    });
  } else {
    return res;
  }
};
