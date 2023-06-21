import {
  createSpawnRegion,
  createSpawnRegions,
  getSpawnRegion,
} from "../queries/querySpawnRegion";
import { Prisma } from "@prisma/client";
import { updateSpawnedResourcesForSpawnRegionTransaction } from "../queries/queryResource";
import { SpawnRegionWithResources } from "../types";

export { getSpawnRegionsFromH3Indices as getRegionsFromH3Array } from "../queries/querySpawnRegion";

export const handleCreateSpawnRegion = async (
  spawnRegionModel: Prisma.SpawnRegionCreateInput
) => {
  return await createSpawnRegion(spawnRegionModel);
};

export const handleCreateSpawnRegions = async (
  spawnRegionModels: Prisma.SpawnRegionCreateManyInput[]
) => {
  return await createSpawnRegions(spawnRegionModels);
};

export const updateSpawnRegion = async (
  spawnRegionId: string
): Promise<SpawnRegionWithResources | null> => {
  //resources should be included with the region
  const spawnRegion = await getSpawnRegion(
    spawnRegionId
  )

  if (!spawnRegion) {
    console.error(`Couldn't find SpawnRegion (id=${spawnRegionId}) to update.`);
    return null;
  }

  let updatedSpawnRegion: SpawnRegionWithResources | undefined;

  try {
    // Now update the SpawnedResources for this SpawnRegion
    updatedSpawnRegion = await updateSpawnedResourcesForSpawnRegionTransaction(
      spawnRegion.id
    );
    return updatedSpawnRegion || null;
  } catch (err) {
    // Transaction did not go through
    return null;
  }
};
