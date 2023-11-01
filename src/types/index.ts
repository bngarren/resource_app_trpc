import {
  Prisma,
  SpawnedResource,
  Resource,
  ItemType,
  HarvestOperation,
  ResourceUserInventoryItem,
  HarvesterUserInventoryItem,
  Harvester,
} from "@prisma/client";

/*

We create variations of the Prisma generated types according to Prisma doc's suggested
solution at https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#problem-using-variations-of-the-generated-model-type

Essentially, the 'Prisma.validator' is a utility function that ensures a certain query shape is correct/valid
according to our schema. By passing this validated query to Prisma's 'GetPayload' utility we can get the 
expected type that would return from using this query. This allows us to create types that include certain 
relations, e.g. SpawnedResourceWithResource.

*/

/** A dev type that helps me to see to full type structure of my types
 */
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// - - - - - Resource - - - - -

const resourceWithRarityQuery = Prisma.validator<Prisma.ResourceArgs>()({
  include: {
    resourceRarity: true,
  },
});

/**
 * ### A `Resource` type with its associated `ResourceRarity`
 */
export type ResourceWithRarity = Omit<
  Prisma.ResourceGetPayload<typeof resourceWithRarityQuery>,
  "resourceRarityLevel"
>;

// - - - - - SpawnedResource - - - - -

const spawnedResourceWithResourceQuery =
  Prisma.validator<Prisma.SpawnedResourceArgs>()({
    include: {
      resource: true,
    },
  });
/**
 * ### A SpawnedResource type that includes its associated Resource
 *
 * A **'spawned resource'** is one that has been populated into the world, i.e.
 * associated with a spawn region and having an h3 index. A **'Resource'** is
 * the static model that contains the details about the resource which the spawned
 * resource references.
 */
export type SpawnedResourceWithResource = Omit<
  Prisma.SpawnedResourceGetPayload<typeof spawnedResourceWithResourceQuery>,
  "resourceId"
>;

// - - - - - SpawnRegion - - - - -

const spawnRegionWithSpawnedResourcesQuery =
  Prisma.validator<Prisma.SpawnRegionArgs>()({
    include: {
      spawnedResources: true,
    },
  });

/**
 * ### A SpawnRegion type that includes spawned resources (each of the type
 * `SpawnedResourceWithResource`)
 *
 * If you do not need the full Resource model returned with the SpawnedResource,
 * use `SpawnRegionWithSpawnedResourcesPartial` type.
 */
export type SpawnRegionWithSpawnedResources = Omit<
  Prisma.SpawnRegionGetPayload<typeof spawnRegionWithSpawnedResourcesQuery>,
  "spawnedResources"
> & { spawnedResources: SpawnedResourceWithResource[] };

/**
 * ### A SpawnRegion type that includes spawned resources (each of the type
 * `SpawnedResource`)
 *
 * **DOES NOT INCLUDE** the full Resource model. For this type,
 * see `SpawnRegionWithSpawnedResources`
 */
export type SpawnRegionWithSpawnedResourcesPartial = Omit<
  Prisma.SpawnRegionGetPayload<typeof spawnRegionWithSpawnedResourcesQuery>,
  "spawnedResources"
> & { spawnedResources: SpawnedResource[] };

// - - - - - HarvestOperation - - - - -

/**
 * A HarvestOperation type that includes the resetDate of the spawned resource's
 * spawn region
 */
export type HarvestOperationWithResetDate = HarvestOperation &
  Pick<Prisma.SpawnRegionGetPayload<true>, "resetDate">;

const harvestOperationWithSpawnedResourceQuery =
  Prisma.validator<Prisma.HarvestOperationArgs>()({
    include: {
      spawnedResource: {
        include: {
          resource: true,
        },
      },
    },
  });
/**
 * A HarvestOperation type that includes its SpawnedResource (which also includes its
 * associated Resource)
 *
 * Thus, the **'spawnedResource'** property holds a `SpawnedResourceWithResource` type.
 */
export type HarvestOperationWithSpawnedResourceWithResource = Omit<
  Prisma.HarvestOperationGetPayload<
    typeof harvestOperationWithSpawnedResourceQuery
  >,
  "spawnedResourceId" | "spawnedResource"
> & { spawnedResource: SpawnedResourceWithResource };

export type ArcaneEnergyResource = Resource & {
  resourceType: "ARCANE_ENERGY";
  energyEfficiency: number;
};

// - - - - - Inventory Items - - - - -

/**
 * Omits the itemType property from a given type, T
 *
 * E.g., Used when dealing with CREATE, UPDATE, UPSERT operations
 * on ResourceUserInventoryItem, HarvesterUserInventoryItem, etc. so
 * that the itemType should not be included in the input.
 */
export type OmitItemType<T> = Omit<T, "itemType">;

/**
 * A UserInventoryItem represents a row in one of the tables:
 * - ResourceUserInventoryItem
 * - HarvesterUserInventoryItem
 * - ~ComponentUserInventoryItem~ (TBD)
 *
 * It does **NOT** include the item's data only a reference id, e.g. resourceId, harvesterId
 *
 * Use the type `UserInventoryItemWithItem` to include the item details
 */
export type UserInventoryItem =
  | ResourceUserInventoryItem
  | HarvesterUserInventoryItem;

/**
 * A extended type of `UserInventoryItem` that includes item details:
 * - e.g. resource, harvester, ~component~
 *
 * #### Example
 * ```typescript
 * ResourceUserInventoryItem & { resource: Resource }
 * ```
 */
export type UserInventoryItemWithItem<T extends ItemType> = T extends "RESOURCE"
  ? ResourceUserInventoryItem & { item: Resource; itemType: "RESOURCE" }
  : T extends "HARVESTER"
  ? HarvesterUserInventoryItem & { item: Harvester; itemType: "HARVESTER" }
  : never;

export type UserInventoryItemWithAnyItem = UserInventoryItemWithItem<
  "RESOURCE" | "HARVESTER"
>;

/**
 * This dictionary is used to pass around a user's inventory items, categorized and typed by
 * `itemType` (e.g. Resource, Harvester, etc.)
 */
export type UserInventoryDict = {
  resources: UserInventoryItemWithItem<"RESOURCE">[];
  harvesters: UserInventoryItemWithItem<"HARVESTER">[];
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type LatLngTuple = [number, number];

export type InteractableType = "resource" | "equipment";

/**
 * An 'Interactable' is an entity that has a location (latitude/longitude) and a relative distance from the 'user' or
 * a specific location. We use a harvestRegion (or the region where the user scanned from...and will subsequently harvest from) as
 * the basis of the distance and userCanInteract properties.
 *
 * We use specific types of Interactables that carry a 'data' payload with more info about the specific interactable,
 * e.g. InteractableResource, InteractableEquipment
 */
export type Interactable = {
  /**
   * A random uuid for this `Interactable`, recreated each time we return a ScanResult.
   * This uuid is used on the client side to keep track of interactables, and used in conjunction
   * with the `sortedCanInteractableIds` property on ScanResult
   */
  id?: string;
  type: InteractableType;
  location: LatLngTuple;
  /**
   * Conceptually, this is the distance from the scan region to this interactable entity.
   */
  distanceFromHarvestRegionCenter: number;
  userCanInteract: boolean;
};

/**
 * A type of `Interactable` that carries a `Resource` payload in the 'data' property
 */
export type InteractableResource = {
  data: Resource;
} & Interactable;

/**
 * A type of `Interactable` that carries an `Equipment` payload in the 'data' property
 * TODO: NOT YET IMPLEMENTED
 */
export type InteractableEquipment = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
} & Interactable;

/**
 * A ScanResult is the type returned from a completion of the scan logic.
 *
 * I.e., Refer to scanService.ts (handleScan)
 *
 * Currently, this is the type that is returned to the client after a
 * successful /scan request.
 */
export type ScanResult = {
  metadata: {
    scannedLocation: LatLngTuple;
    timestamp?: string;
  };
  /**
   * scanPolygons are closely related to harvest regions. The centerPolygon is the
   * harvestRegion (and of size defined by config.harvest_h3_resolution). The peripheral
   * polygons are neighboring regions that the user can scan/harvest from if moved into the area.
   */
  scanPolygons: {
    centerPolygon: LatLngTuple[];
    peripheralPolygons: LatLngTuple[][];
  };
  neighboringPolygons: LatLngTuple[][];

  // Instead of just specifying Interactable[], we will force an array of either InteractableResource or InteractableEquipment
  // so that we are more intentional about the interactables in the ScanResult
  interactables: (InteractableResource | InteractableEquipment)[];
  /**
   * A sorted array of Interactable Id's by distanceFromHarvestRegionCenter
   * Includes only those interactables with userCanInteract = true
   */
  sortedCanInteractableIds: string[];
};

export type InventoryItem = {
  id: string; // matches an id in the UserInventoryItem table
  name: string;
  type: ItemType;
  quantity: number;
};

export type PlayerInventory = {
  timestamp: string; // time obtained from API
  items: InventoryItem[];
};
