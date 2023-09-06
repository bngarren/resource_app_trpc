import { Harvester, User } from "@prisma/client";
import { harvesterCollectRequestSchema } from "../schema";
import { protectedProcedure, router } from "../trpc/trpc";
import { getUserByUid } from "../services/userService";
import { TRPCError } from "@trpc/server";
import {
  getHarvester,
  handleCollect,
  isHarvesterDeployed,
} from "../services/harvesterService";

export const harvesterRouter = router({
  /***
   * /harvester.collect
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
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      // TODO: experimental. Skipping steps for now
      // - Calculate the amount of resources collected
      // - Add resources to user's inventory, i.e. update each applicable row of UserInventoryItem based on user.id

      // ! For now, we are just performing the UserInventoryItem update portion...

      const collectResult = handleCollect(user.id, harvester.id);
    }),
});
