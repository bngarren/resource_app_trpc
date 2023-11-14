import { TRPCError } from "@trpc/server";
import { getUserInventoryRequestSchema } from "../schema";
import { getUserByUid } from "../services/userService";
import { protectedProcedure, router } from "../trpc/trpc";
import { User } from "@prisma/client";
import {
  getPlayerInventoryFromUserInventoryItems,
  getUserInventoryItems,
} from "../services/userInventoryService";

export const userInventoryRouter = router({
  getUserInventory: protectedProcedure
    .input(getUserInventoryRequestSchema)
    .query(async ({ input }) => {
      // first get the user associated with this user uid
      let user: User;
      try {
        user = await getUserByUid(input.userUid);
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (error instanceof Error && error.message) || "",
        });
      }

      // OK if returns empty []
      const userInventoryItems = await getUserInventoryItems(user.id);

      // Now convert to a PlayerInventory (which is client facing)
      return await getPlayerInventoryFromUserInventoryItems(userInventoryItems);
    }),
});
