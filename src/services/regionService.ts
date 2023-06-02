import { cellToChildren } from "h3-js";
import {
  createRegion,
  createRegions,
  getRegionById,
} from "./../queries/queryRegion";
import { Prisma, Region } from "@prisma/client";
import selectRandom from "../util/selectRandom";
import { createRandomResourceModel } from "./resourceService";
import { createResources } from "../queries/queryResource";
import config from "../config";
import { getAllSettled } from "../util/getAllSettled";

export { getRegionsFromH3Array } from "./../queries/queryRegion";

const populateResourcesForRegion = async (
  region: Region,
  quantity: number,
  resourceH3Resolution: number
) => {
  // Get the child h3's of this region at the specified resolution
  // These are potential spots for a resource
  const potentials = cellToChildren(region.h3Index, resourceH3Resolution);

  // Select some of these spots randomly
  const selected = selectRandom(potentials, quantity);

  // Now create the resources from these h3 indices
  const models = selected.map((s) => {
    return createRandomResourceModel(region.id, s);
  });

  const newResources = await createResources(models);

  return newResources;
};

export const handleCreateRegion = async (
  regionModel: Prisma.RegionCreateInput,
  withResources = true
) => {
  const newRegion = await createRegion(regionModel);

  if (withResources) {
    await populateResourcesForRegion(
      newRegion,
      config.resources_per_region,
      config.resource_h3_resolution
    );
  }
  return newRegion
};

export const handleCreateRegions = async (
  regionModels: Prisma.RegionCreateManyInput[],
  withResources = true
) => {
  const newRegions = await createRegions(regionModels);

  if (withResources) {
    await getAllSettled(
      newRegions.map((r) => {
        return populateResourcesForRegion(
          r,
          config.resources_per_region,
          config.resource_h3_resolution
        );
      })
    );
  }
  return newRegions
};

export const updateRegion = async (
  regionId: number
): Promise<Region | null> => {
  const region = await getRegionById(regionId);

  if (!region) {
    console.error(`Couldn't find region (id=${regionId}) to update.`);
    return null;
  }

  return null;
};
