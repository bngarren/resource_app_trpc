
import { Prisma, SpawnRegion, SpawnedResource, Resource } from "@prisma/client";

// A dev type that helps me to see to full type structure of my types
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

/**
 * A custom SpawnedResource type that includes the associated Resource
 */
export type SpawnedResourceWithResource = Omit<Prisma.SpawnedResourceGetPayload<{
  include: {
    resource: true
  }
}>, "resourceId">

/**
 * A SpawnRegion type that includes all spawned resources (each of the type
 * `SpawnedResourceWithResource`)
 */
export interface SpawnRegionWithResources extends Omit<Prisma.SpawnRegionGetPayload<{}>, 'SpawnedResources'> {
  resources: SpawnedResourceWithResource[];
}

/**
 * A SpawnRegion type that includes all spawned resources (each of the type
 * `SpawnedResource`). **DOES NOT INCLUDE** the full Resource model. For this type,
 * see `SpawnRegionWithResources`
 */
export interface SpawnRegionWithResourcesPartial extends Omit<Prisma.SpawnRegionGetPayload<{}>, 'SpawnedResources'> {
  resources: SpawnedResource[];
}

type test = Expand<SpawnRegionWithResources>

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type LatLngTuple = [number, number]

export type InteractableType = "resource" | "equipment";

export type Interactable = {
  id?: String; // id is for the client
  type: InteractableType;
  location: LatLngTuple;
  distanceFromScanRegionCenter: number;
  userCanInteract: boolean;
};

export type InteractableResource = {
  data: Resource;
} & Interactable;

export type ScanResult = {
  metadata: {
    scannedLocation: LatLngTuple;
    timestamp?: string;
  };
  scanPolygons: {
    centerPolygon: LatLngTuple[],
    peripheralPolygons: LatLngTuple[][]
  }
  neighboringPolygons: LatLngTuple[][];
  interactables: Interactable[];
  /**
   * A sorted array of Interactable Id's by distanceFromScanRegionCenter
   * Includes only those interactables with userCanInteract = true
   */
  sortedCanInteractableIds: String[];
};
