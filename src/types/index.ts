import { Prisma, Region, Resource } from "@prisma/client";
import { getRegionById } from "../queries/queryRegion";

export type RegionWithResources = Region & {
  resources: Resource[];
};

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
