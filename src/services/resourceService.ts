import {
  Prisma,
  SpawnRegion,
  SpawnedResource,
  ResourceType,
  ResourceRarity,
} from "@prisma/client";
import selectRandom from "../util/selectRandom";
import {
  createResource,
  createResources,
  getResource,
  getResourcesForSpawnRegion,
} from "../queries/queryResource";
import { cellToChildren, getResolution } from "h3-js";
import { SpawnedResourceWithResource } from "../types";

/**
 * ### Helper function for converting a SpawnedResourceWithResource back to a SpawnedResource type
 * Sometimes we just want to carry the SpawnedResource type without the associated `resource: Resource`
 * property.
 *
 * @param fullResource The SpawnedResourceWithResource object to prune
 * @returns SpawnedResource
 */
export const pruneSpawnedResourceWithResource = (
  fullResource: SpawnedResourceWithResource,
): SpawnedResource => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { resource: _, ...rest } = fullResource;
  return rest as SpawnedResource;
};

/**
 * ### Helper function for converting a SpawnedResource into a SpawnedResourceWithResource type
 * _This is the opposite of the_ `pruneSpawnedResourceWithResource` function
 *
 * This function adds a `resource: Resource` property to SpawnedResource
 *
 * @param spawnedResource
 * @returns SpawnedResoureWithResource
 */
export const extendSpawnedResource = async (
  spawnedResource: SpawnedResource,
): Promise<SpawnedResourceWithResource> => {
  const res = await getResource(spawnedResource.resourceId);
  return {
    ...spawnedResource,
    resource: res,
  };
};

export const getResourcesInSpawnRegion = async (spawnRegionId: string) => {
  // queryResource
  return await getResourcesForSpawnRegion(spawnRegionId);
};

// TODO move somewhere else
const RESOURCE_NAMES = ["Gold", "Silver", "Iron", "Copper"];

export const createRandomResourceModel = () => {
  const [name] = selectRandom(RESOURCE_NAMES, [1, 1]);

  const result: Prisma.ResourceCreateInput = {
    url: name.toLocaleLowerCase(),
    name: name,
    resourceType: ResourceType.REGULAR,
    rarity: ResourceRarity.COMMON,
  };

  return result;
};

export const createSpawnedResourceModel = (
  spawnRegionId: string,
  resourceH3Index: string,
  partialResourceModel: Prisma.ResourceCreateInput,
) => {
  // using "connect" is the idiomatic way to associate the new record with an existing record by its unique identifier
  const result: Prisma.SpawnedResourceCreateInput = {
    spawnRegion: {
      connect: {
        id: spawnRegionId,
      },
    },
    resource: {
      create: partialResourceModel,
    },
    h3Index: resourceH3Index,
    h3Resolution: getResolution(resourceH3Index),
  };

  return result;
};

export const handleCreateResource = async (
  resourceModel: Prisma.ResourceCreateInput,
) => {
  return await createResource(resourceModel);
};

export const handleCreateResources = async (
  resourceModels: Prisma.ResourceCreateManyInput[],
) => {
  return await createResources(resourceModels);
};

/**
 *
 * The goal of this function is to create new SpawnedResource models for a given
 * SpawnRegion. These models are then used to update the SpawnedResources table
 * in the database.
 *
 * This function relies on using some RNG to vary the location of resource spawns
 * and type. // TODO: Can implement rarity, etc.
 *
 * @param spawnRegion
 * @param quantity
 * @param resourceH3Resolution
 * @returns
 */
export const generateSpawnedResourceModelsForSpawnRegion = (
  spawnRegion: SpawnRegion,
  quantity: [number, number],
  resourceH3Resolution: number,
) => {
  // Get the children h3 indexes of this (parent) spawn region at the specified h3 resolution
  // These are potential spots for a resource
  const potentials = cellToChildren(spawnRegion.h3Index, resourceH3Resolution);

  // Select some of these spots randomly
  const selectedH3Indices = selectRandom(potentials, quantity);

  /* Now create the spawned resource models from these h3 indices

    First we create random resource models
    Then we make spawned resource models from these (giving a spawn region and
      h3Index for the resource)

    */
  const spawnedResourceModels = selectedH3Indices.map((s) => {
    const resourceModel = createRandomResourceModel();
    return createSpawnedResourceModel(spawnRegion.id, s, resourceModel);
  });

  return spawnedResourceModels;
};
