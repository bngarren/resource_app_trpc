import { Prisma, SpawnRegion, SpawnedResource, Resource } from "@prisma/client";

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
  extends Omit<Prisma.SpawnRegionGetPayload<{}>, "SpawnedResources"> {
  resources: SpawnedResourceWithResource[];
}

/**
 * A SpawnRegion type that includes all spawned resources (each of the type
 * `SpawnedResource`). **DOES NOT INCLUDE** the full Resource model. For this type,
 * see `SpawnRegionWithResources`
 */
export interface SpawnRegionWithResourcesPartial
  extends Omit<Prisma.SpawnRegionGetPayload<{}>, "SpawnedResources"> {
  resources: SpawnedResource[];
}

type test = Expand<SpawnRegionWithResources>;

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
 */
export type Interactable = {
  /**
   * A random uuid for this `Interactable`, recreated each time we return a ScanResult.
   * This uuid is used on the client side to keep track of interactables, and used in conjunction
   * with the `sortedCanInteractableIds` property on ScanResult
   */
  id?: String;
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

export type ScanResult = {
  metadata: {
    scannedLocation: LatLngTuple;
    timestamp?: string;
  };
  scanPolygons: {
    centerPolygon: LatLngTuple[];
    peripheralPolygons: LatLngTuple[][];
  };
  neighboringPolygons: LatLngTuple[][];
  interactables: Interactable[];
  /**
   * A sorted array of Interactable Id's by distanceFromHarvestRegionCenter
   * Includes only those interactables with userCanInteract = true
   */
  sortedCanInteractableIds: String[];
};
