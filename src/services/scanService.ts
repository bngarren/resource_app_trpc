import * as h3 from "h3-js";
import { prisma } from "../prisma";
import { Region } from "@prisma/client";
import { getAllSettled } from "../util/getAllSettled";
import {
  updateRegion,
  getRegionsFromH3Array,
  handleCreateRegion,
  handleCreateRegions,
} from "./regionService";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Interactable = {
  category: "resource" | "equipment";
  position: Coordinate;
  distanceFromUser: number;
  userCanInteract: boolean;
};

type ScanResult = {
  metadata: {
    scannedLocation: Coordinate;
    timestamp?: string;
  };
  interactables: Interactable[];
};

export const handleScan = async (
  fromLocation: Coordinate,
  scanDistance = 1
): Promise<ScanResult> => {
  const latitude = fromLocation.latitude;
  const longitude = fromLocation.longitude;

  // Get the h3 index based on the scan position
  const h3Index = h3.latLngToCell(latitude, longitude, 9);

  // Get the 6 neighbors plus the central h3 (7 total)
  const h3Group = h3.gridDisk(h3Index, scanDistance);

  const existingRegions: Region[] = await getRegionsFromH3Array(h3Group);

  // Missing regions - not present in the database
  // i.e., An array of h3Indexes that need to be added to db
  const missingRegionsIndexes = h3Group.filter(
    (h) => !existingRegions.some((r) => r.h3Index === h)
  );

  console.log(
    `Missing regions (${missingRegionsIndexes.length}): ${missingRegionsIndexes}`
  );

  // - - - - - - Create these regions in the database - - - - -
  const regionModels = missingRegionsIndexes.map((m) => {
    return { h3Index: m };
  });
  const newRegions = await handleCreateRegions(regionModels);

  let regions = [...existingRegions, ...newRegions];

  // the number of h3 indexes in the scan group should equal
  // the number of regions we now have (existing + newly created)
  if (regions.length !== h3Group.length) {
    throw new Error("Did not match h3 indices with regions in the database");
  }

  // - - - - - Update each region - - - - -
  //regions = await getAllSettled<Region>(regions.map((r) => updateRegion(r)));

  const result: ScanResult = {
    metadata: {
      scannedLocation: fromLocation,
    },
    interactables: [],
  };

  return result;
};
