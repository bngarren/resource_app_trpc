import { getUserInventoryRequestSchema } from "../schema";
import { protectedProcedure, router } from "../trpc/trpc";

export const userInventoryRouter = router({
  getUserInventory: protectedProcedure
    .input(getUserInventoryRequestSchema)
    .query(async (opts) => {
      console.log(opts);
      return 200;
    }),
});
