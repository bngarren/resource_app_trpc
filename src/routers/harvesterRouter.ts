import * as h3 from "h3-js";
import { Harvester, User } from "@prisma/client";
import {
  harvesterCollectRequestSchema,
  harvesterDeployRequestSchema,
  harvesterTransferEnergyRequestSchema,
  harvesterReclaimRequestSchema,
} from "../schema";
import { protectedProcedure, router } from "../trpc/trpc";
import { getUserByUid } from "../services/userService";
import { TRPCError } from "@trpc/server";
import {
  getHarvester,
  handleCollect,
  handleDeploy,
  handleReclaim,
  isHarvesterDeployed,
  handleTransferEnergy,
} from "../services/harvesterService";
import config from "../config";
import { logger } from "../logger/logger";

export const harvesterRouter = router({
  /**
   * ### /harvester.deploy
   * Places a harvester in a harvestRegion. Removes the harvester from the user's inventory.
   * Note, the harvester does not start until energy is added.
   */
  deploy: protectedProcedure
    .input(harvesterDeployRequestSchema)
    .mutation(async ({ input }) => {
      // validate h3 index
      const isValid =
        h3.getResolution(input.harvestRegion) === config.harvest_h3_resolution;

      if (isValid === false) {
        throw new TRPCError({
          message: `harvesterRegion: ${input.harvestRegion} not valid or wrong resolution.`,
          code: "NOT_FOUND",
        });
      }

      // throws TRPCErrors
      const result = await handleDeploy(input.harvesterId, input.harvestRegion);

      if (result == null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
      return result;
    }),
  /***
   * ### /harvester.collect
   * Collects the resources from the harvester and puts them in the
   * user's inventory.
   */
  collect: protectedProcedure
    .input(harvesterCollectRequestSchema)
    .mutation(async ({ input }) => {
      // first get the user associated with this user uid
      let user: User;
      try {
        user = await getUserByUid(input.userUid);
      } catch (error) {
        throw new TRPCError({
          message: `userUId: ${input.userUid}`,
          code: "NOT_FOUND",
        });
      }
      // next, get the harvester with this id
      let harvester: Harvester;
      try {
        harvester = await getHarvester(input.harvesterId);
      } catch (error) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId}`,
          code: "NOT_FOUND",
        });
      }

      // Verify that this harvester is owned by this user
      if (harvester.userId !== user.id) {
        throw new TRPCError({
          message: `userUId: ${input.userUid} does not own this harvester: ${input.harvesterId}`,
          code: "FORBIDDEN",
        });
      }

      // Verify that this harvester is currently deployed.
      // We can't collect from a harvester that isn't deployed. This shouldn't even be doable
      // from the client side, but we still check here

      let isDeployed;
      try {
        isDeployed = isHarvesterDeployed(harvester);
      } catch (error) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId}`,
          code: "NOT_FOUND",
        });
      }

      if (!isDeployed) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId} is not deployed`,
          code: "CONFLICT",
        });
      }

      // TODO: experimental. Skipping steps for now
      // - Calculate the amount of resources collected
      // - Add resources to user's inventory, i.e. update each applicable row of UserInventoryItem based on user.id

      // ! For now, we are just performing the UserInventoryItem update portion...

      const collectResult = handleCollect(user.id, harvester.id);
    }),
  /**
   * ### /harvester.reclaim
   * Returns the harvester to the user's inventory.
   * This will also `collect` all resources in the harvester.
   */
  reclaim: protectedProcedure
    .input(harvesterReclaimRequestSchema)
    .mutation(async ({ input }) => {
      // Get the harvester with this id
      let harvester: Harvester;
      try {
        harvester = await getHarvester(input.harvesterId);
      } catch (error) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId}`,
          code: "NOT_FOUND",
        });
      }
      // Verify that this harvester is currently deployed.
      // We can't reclaim a harvester that isn't deployed. This shouldn't even be doable
      // from the client side, but we still check here

      let isDeployed;
      try {
        isDeployed = isHarvesterDeployed(harvester);
      } catch (error) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId}`,
          code: "NOT_FOUND",
        });
      }

      if (!isDeployed) {
        throw new TRPCError({
          message: `harvester: ${input.harvesterId} is not deployed`,
          code: "CONFLICT",
        });
      }

      logger.info(harvester, `Reclaiming harvester`);

      const res = await handleReclaim(harvester.id);
    }),
  transferEnergy: protectedProcedure
    .input(harvesterTransferEnergyRequestSchema)
    .mutation(async ({ input }) => {
      // verify harvester exists and is deployed
      const harvester = await verifyDeployedHarvester(input.harvesterId);

      // Verify that the energy type being added/removed is the same as what is already in the harvester, if present
      if (
        harvester.energySourceId != null &&
        harvester.energySourceId !== input.energySourceId
      ) {
        const errMsg = `Cannot modify energy of a different type than what is presently in the harvester (id=${harvester.id})`;
        logger.error(errMsg);
        throw new TRPCError({
          message: errMsg,
          code: "CONFLICT",
        });
      }

      /* //* NOTE: 
      We pass null as the `atTime` parameter to default to current time. Will have to consider
      whether we should be using a timestamp from the incoming request... */
      const res = await handleTransferEnergy(
        harvester,
        input.amount,
        input.energySourceId,
        null,
        input.useUserInventory !== true ? null : undefined,
      );

      return res;
    }),
});

/**
 * ### Verify that harvester exists, by id, and is deployed
 *
 * See `isHarvesterDeployed()` for logic
 * @param harvesterId
 * @returns Harvester, or throws TRPC error
 */
async function verifyDeployedHarvester(harvesterId: string) {
  // Get the harvester with this id
  let harvester: Harvester;
  try {
    harvester = await getHarvester(harvesterId);
  } catch (error) {
    const errMsg = `harvester: ${harvesterId} not found`;
    logger.error(errMsg);
    throw new TRPCError({
      message: errMsg,
      code: "NOT_FOUND",
    });
  }

  // Verify that this harvester is currently deployed.
  // We can't modify the energy of a harvester that isn't deployed.
  // This shouldn't even be doable from the client side, but we still check here

  let isDeployed;
  try {
    isDeployed = isHarvesterDeployed(harvester);

    if (!isDeployed) {
      const errMsg = `harvester: ${harvesterId} is not deployed`;
      logger.error(errMsg);
      throw new TRPCError({
        message: errMsg,
        code: "CONFLICT",
      });
    }
  } catch (error) {
    const errMsg = `harvester: ${harvesterId} not found`;
    logger.error(errMsg);
    throw new TRPCError({
      message: errMsg,
      code: "NOT_FOUND",
    });
  }

  return harvester;
}
