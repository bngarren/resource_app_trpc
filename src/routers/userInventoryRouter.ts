import { TRPCError } from "@trpc/server";
import { getUserInventoryRequestSchema } from "../schema";
import { getUserByUid } from "../services/userService";
import { protectedProcedure, router } from "../trpc/trpc";
import { User } from "@prisma/client";
import { getUserInventory } from "../services/userInventoryService";

export const userInventoryRouter = router({
  getUserInventory: protectedProcedure
    .input(getUserInventoryRequestSchema)
    .query(async ({ input }) => {
      // first get the user associated with this user uid
      let user: User;
      try {
        user = await getUserByUid(input.userUid);
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const userInventory = await getUserInventory(user.id);

      return userInventory;
    }),
});
