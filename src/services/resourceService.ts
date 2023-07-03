import { Prisma, Resource, SpawnRegion, SpawnedResource } from "@prisma/client";
import selectRandom from "../util/selectRandom";
import {
  createResource,
  createResources,
  getResource,
  getResources,
  getResourcesForSpawnRegion,
} from "../queries/queryResource";
import { cellToChildren, getResolution } from "h3-js";
import { SpawnedResourceWithResource } from "../types";
import { logger } from "../logger/logger";

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
  const allResources = await getResources();

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
 * @param partialResourceModel
 * @returns SpawnedResourceModel
 */
export const createSpawnedResourceModel = (
  spawnRegionId: string,
  resourceH3Index: string,
  resourceId: string,
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

    The following code is a bit lengthy because we are dealing with Promise.allSettled()
    and handling the fulfilled or rejected promises for each attempt at creating a
    spawned resource model. This is currently favored over Promise.all() so that we
    can get the reject reason/error for why each operation failed. Either way,
    the generateSpawnedResourceModelsForSpawnRegion() function should throw and 
    not result in any subsequent database operation related to these spawned resource models.

  */

  const results: PromiseSettledResult<Prisma.SpawnedResourceCreateInput>[] =
    // Promise.allSettled will run all operations even if one rejects/throws
    await Promise.allSettled(
      selectedH3Indices.map(
        async (selectedIndex): Promise<Prisma.SpawnedResourceCreateInput> => {
          const resource = await getRandomResource();
          return createSpawnedResourceModel(
            spawnRegion.id,
            selectedIndex,
            resource.id,
          );
        },
      ),
    );

  // Now we sift through the results and see which ones fufilled and which ones rejected
  const spawnedResourceModels = results
    .filter(
      (r): r is PromiseFulfilledResult<Prisma.SpawnedResourceCreateInput> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
  const errors: unknown[] = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);

  // Safety check
  // We want to throw an error if any one createSpawnedResourceModel failed because something
  // might be corrupted and the others might be incorrect as well
  if (
    errors.length !== 0 ||
    selectedH3Indices.length !== spawnedResourceModels.length
  ) {
    errors.forEach((err) => {
      logger.error(
        { err },
        `Error occurred within generateSpawnedResourceModelsForSpawnRegion`,
        spawnRegion,
      );
    });

    throw new Error("Problem with generateSpawnedResourceModelsForSpawnRegion");
  }

  return spawnedResourceModels;
};
