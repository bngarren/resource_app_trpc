import {
  createRegion,
  createRegions,
  getRegionById,
} from "./../queries/queryRegion";
import { Prisma } from "@prisma/client";
import {
  updateResourcesForRegionTransaction,
} from "../queries/queryResource";
import { RegionWithResources } from "../types";

export { getRegionsFromH3Array } from "./../queries/queryRegion";


export const handleCreateRegion = async (
  regionModel: Prisma.RegionCreateInput
) => {
  return await createRegion(regionModel);
};

export const handleCreateRegions = async (
  regionModels: Prisma.RegionCreateManyInput[]
) => {
  return await createRegions(regionModels);
};

export const updateRegion = async (
  regionId: number
): Promise<RegionWithResources | null> => {
  //resources should be included with the region
  const region = await getRegionById(regionId, true) as RegionWithResources;

  if (!region) {
    console.error(`Couldn't find region (id=${regionId}) to update.`);
    return null;
  }

  if (region.resources === undefined) {
    console.error(`Couldn't find resources associated with the given region (id=${regionId}) to update.`);
    return null;
  }

  let updatedRegion: RegionWithResources | undefined;

  try {
    updatedRegion = await updateResourcesForRegionTransaction(region);
    return updatedRegion || null;
  } catch (err) {
    // Transaction did not go through
    return null;
  }
};
