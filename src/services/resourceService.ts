import { Prisma, Resource, SpawnRegion, SpawnedResource } from "@prisma/client";
import selectRandom from "../util/selectRandom";
import {
  prisma_createResource,
  prisma_createResources,
  prisma_getResourceById,
  prisma_getResourceByIdWithRarity,
  prisma_getResourceByUrl,
  prisma_getResourceByUrlWithRarity,
  prisma_getResources,
  prisma_getSpawnedResourcesWithResourceForSpawnRegion,
} from "../queries/queryResource";
import { cellToChildren, getResolution } from "h3-js";
import { ResourceWithRarity, SpawnedResourceWithResource } from "../types";
import { prefixedError } from "../util/prefixedError";

/**
 * ### Gets a single Resource, by id (primary key)
 *
 * If `withRarity`= **false** (_default_), returns a `Resource` model only. If **true**,
 * returns a `ResourceWithRarity` type.
 *
 * **Throws** error if resource is not found.
 */
export const getResource = async <T extends boolean = false>(
  resourceId: string,
  withRarity: T = false as T, // typescript needs to know default value is type T
): Promise<T extends true ? ResourceWithRarity : Resource> => {
  /* We use a generic T to help return the correct type based on the withRarity boolean.
  
  Have to return each of these casted as `any` because Typescript can't determine
  the actual type at that location; however, the callers of this function will receive
  the correct type due to the return type in the function signature.
  */
  if (withRarity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await prisma_getResourceByIdWithRarity(resourceId)) as any;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await prisma_getResourceById(resourceId)) as any;
  }
};

/**
 * ### Gets a single Resource, by url (unique)
 *
 * If `withRarity`= **false** (_default_), returns a `Resource` model only. If **true**,
 * returns a `ResourceWithRarity` type.
 *
 * **Throws** error if resource is not found.
 *
 */
export const getResourceWithUrl = async <T extends boolean = false>(
  resourceUrl: string,
  withRarity: T = false as T,
) => {
  // For typescript explanation, see `getResource()`
  if (withRarity) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await prisma_getResourceByUrlWithRarity(resourceUrl)) as any;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await prisma_getResourceByUrl(resourceUrl)) as any;
  }
};

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
  const res = await prisma_getResourceById(spawnedResource.resourceId);
  return {
    ...spawnedResource,
    resource: res,
  };
};

/**
 * ### Returns the SpawnedResourcesWithResource associated with a SpawnRegion
 * By default, this will return only those spawned resources that are active.
 * @param spawnRegionId
 * @param includeInactive Optional. Defaults to false. Set to true to retrieve ALL resources (inactive and active)
 * @returns
 */
export const getResourcesInSpawnRegion = async (
  spawnRegionId: string,
  includeInactive = false,
) => {
  // queryResource
  return await prisma_getSpawnedResourcesWithResourceForSpawnRegion(
    spawnRegionId,
    includeInactive,
  );
};

/**
 * ### Retrieves a random Resource based on rarity
 *
 * **This function does not alter the database.**
 *
 * - Each resource is "weighted" by its its likelihood value,
 * which ranges from 1 to 6.
 * - Resources with a higher likelihood are more likely
 *
 */
export const getRandomResource = async () => {
  const allResources = await prisma_getResources();

  if (allResources.length === 0) {
    throw new Error(
      "Could not find any resources when attempting to select random resource",
    );
  }

  const weightedResourceIds: string[] = [];
  allResources.forEach((resource) => {
    // likelihood is between 1 and 6
    for (let i = 0; i < resource.resourceRarity.likelihood; i++) {
      weightedResourceIds.push(resource.id);
    }
  });

  const index = Math.floor(Math.random() * weightedResourceIds.length);
  const selectedResource = allResources.find(
    (r) => r.id === weightedResourceIds[index],
  );

  if (!selectedResource)
    throw new Error(
      `Unexpected problem selecting random resource with id=${weightedResourceIds[index]}`,
    );

  const { resourceRarity, ...resource } = selectedResource;

  return resource as Resource;
};

/**
 * ### Creates a SpawnedResource from a Resource model
 *
 * This function associates a Resource with a SpawnRegion--which is essentially what
 * a SpawnedResource model represents.
 *
 * **This function does not alter the database.**
 *
 * _Requires a spawn region id and an h3 index (for the resource)_
 * @param spawnRegionId
 * @param resourceH3Index
 * @param resourceId
 * @param isActive
 * @returns SpawnedResourceModel
 */
export const createSpawnedResourceModel = (
  spawnRegionId: string,
  resourceH3Index: string,
  resourceId: string,
  isActive = true,
) => {
  // using "connect" is the idiomatic way to associate the new record with an existing record by its unique identifier
  const result: Prisma.SpawnedResourceCreateInput = {
    spawnRegion: {
      connect: {
        id: spawnRegionId,
      },
    },
    resource: {
      connect: {
        id: resourceId,
      },
    },
    h3Index: resourceH3Index,
    h3Resolution: getResolution(resourceH3Index),
    isActive: isActive,
  };

  return result;
};

export const handleCreateResource = async (
  resourceModel: Prisma.ResourceCreateInput,
) => {
  return await prisma_createResource(resourceModel);
};

export const handleCreateResources = async (
  resourceModels: Prisma.ResourceCreateManyInput[],
) => {
  return await prisma_createResources(resourceModels);
};

// TODO: Go to createRandomResourceModel() to work on the RNG aspect of resources

/**
 *
 * The goal of this function is to create new SpawnedResource models for a given
 * SpawnRegion. These models are then used to update the SpawnedResources table
 * in the database (in a separate function).
 *
 * **This function does not alter the database.**
 *
 * This function relies on using some RNG to vary the location of resource spawns
 * and type.
 *
 * @param spawnRegion
 * @param quantity
 * @param resourceH3Resolution
 * @returns
 */
export const generateSpawnedResourceModelsForSpawnRegion = async (
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

    First we select some random resource
    Then we make spawned resource models from these (giving a spawn region and
    h3Index for the resource)

  */
  let spawnedResourceModels: Prisma.SpawnedResourceCreateInput[] = [];
  try {
    spawnedResourceModels = await Promise.all(
      selectedH3Indices.map(async (selectedIndex) => {
        const resource = await getRandomResource();
        return createSpawnedResourceModel(
          spawnRegion.id,
          selectedIndex,
          resource.id,
        );
      }),
    );
    if (selectedH3Indices.length !== spawnedResourceModels.length) {
      throw new Error(
        "Did not generate as many spawnedResourceModels as intended",
      );
    }
  } catch (error) {
    throw prefixedError(
      error,
      `Error within generateSpawnedResourceModelsForSpawnRegion for spawnRegionId ${spawnRegion.id}`,
    );
  }
  return spawnedResourceModels;
};
