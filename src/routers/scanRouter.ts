import { router } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { logScanResult } from "../logger/loggerHelper";
import { scanRequestSchema } from "../schema";
import { handleScan } from "../services/scanService";
import { protectedProcedure } from "../trpc/trpc";
import config from "../config";

export const scanRouter = router({
  scan: protectedProcedure
    .input(scanRequestSchema)
    .mutation(async ({ input }) => {
      try {
        const res = await handleScan(input.userLocation, config.scan_distance);
        logScanResult(res);
        return res;
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Problem with handleScan..." +
            (err instanceof Error && err.message),
        });
      }
    }),
});
