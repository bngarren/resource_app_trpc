import { SpawnRegion } from "@prisma/client";

/**
 * Checks if the given SpawnRegion's reset_date is nil or overdue (returns true),
 * otherwise returns false.
 * @param region SpawnRegion to check
 * @returns Bool
 */
const isRegionStale = (region: SpawnRegion) => {
  if (!region.resetDate) {
    return true;
  }
  const now = new Date();
  const reset_date = new Date(region.resetDate);
  return now >= reset_date;
};

export default isRegionStale;
