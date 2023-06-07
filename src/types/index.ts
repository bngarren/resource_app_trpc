import { Prisma, Region, Resource } from "@prisma/client";
import { getRegionById } from "../queries/queryRegion";

export type RegionWithResources = Region & {
  resources: Resource[];
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type InteractableType = "resource" | "equipment";

export type Interactable = {
  id?: String; // id is for the client
  type: InteractableType;
  location: Coordinate;
  distanceFromScanRegionCenter: number;
  userCanInteract: boolean;
};

export type InteractableResource = {
  data: Resource;
} & Interactable;

export type ScanResult = {
  metadata: {
    scannedLocation: Coordinate;
    timestamp?: string;
  };
  scanPolygon: Coordinate[];
  neighboringPolygons: Coordinate[][];
  interactables: Interactable[];
};
