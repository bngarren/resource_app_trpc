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

// A dev type that helps me to see to full type structure of my types
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// - - - - - Resource - - - - -

/**
 * A `Resource` type with its associated `ResourceRarity`
 */
export type ResourceWithRarity = Omit<
  Prisma.ResourceGetPayload<{
    include: {
      resourceRarity: true;
    };
  }>,
  "resourceRarityLevel"
>;

// - - - - - SpawnedResource - - - - -
/**
 * A custom SpawnedResource type that includes the associated Resource
 */
export type SpawnedResourceWithResource = Omit<
  Prisma.SpawnedResourceGetPayload<{
    include: {
      resource: true;
    };
  }>,
  "resourceId"
>;

// - - - - - SpawnRegion - - - - -

/**
 * A SpawnRegion type that includes all spawned resources (each of the type
 * `SpawnedResourceWithResource`)
 */
export interface SpawnRegionWithResources
  extends Omit<Prisma.SpawnRegionGetPayload<true>, "SpawnedResources"> {
  resources: SpawnedResourceWithResource[];
}

/**
 * A SpawnRegion type that includes all spawned resources (each of the type
 * `SpawnedResource`). **DOES NOT INCLUDE** the full Resource model. For this type,
 * see `SpawnRegionWithResources`
 */
export interface SpawnRegionWithResourcesPartial
  extends Omit<Prisma.SpawnRegionGetPayload<true>, "SpawnedResources"> {
  resources: SpawnedResource[];
}

// - - - - - HarvestOperation - - - - -

/**
 * A HarvestOperation type that includes the resetDate of the spawned resource's
 * spawn region
 */
export type HarvestOperationWithResetDate = HarvestOperation &
  Pick<Prisma.SpawnRegionGetPayload<true>, "resetDate">;

export type ArcaneEnergyResource = Resource & {
  resourceType: "ARCANE_ENERGY";
  energyEfficiency: number;
};

// - - - - - Inventory Items - - - - -

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
  ? ResourceUserInventoryItem & { item: Resource }
  : T extends "HARVESTER"
  ? HarvesterUserInventoryItem & { item: Harvester }
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

type test = Expand<SpawnRegionWithResources>;
type test2 = Expand<UserInventoryItem>;
type test3 = Expand<UserInventoryItemWithItem<"HARVESTER">>;
type test4 = Expand<ResourceWithRarity>;

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
