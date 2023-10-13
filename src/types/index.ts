import {
  Prisma,
  SpawnedResource,
  Resource,
  ItemType,
  HarvestOperation,
} from "@prisma/client";

// A dev type that helps me to see to full type structure of my types
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

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

/**
 * A HarvestOperation type that includes the resetDate of the spawned resource's
 * spawn region
 */
export type HarvestOperationWithResetDate = HarvestOperation &
  Pick<Prisma.SpawnRegionGetPayload<true>, "resetDate">;

type test = Expand<SpawnRegionWithResources>;
type test2 = Expand<HarvestOperationWithResetDate>;

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
  metadata: Record<string, unknown>;
};

export type PlayerInventory = {
  timestamp: string; // time obtained from API
  items: InventoryItem[];
};
