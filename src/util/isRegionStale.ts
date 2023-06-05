import { Region } from "@prisma/client";

const isRegionStale = (region: Region) => {
    if (!region.resetDate) {
      return true;
    }
    const now = new Date();
    const reset_date = new Date(region.resetDate);
    return now >= reset_date;
  };

  export default isRegionStale