import * as h3 from "h3-js";
import { prisma } from "../prisma";
import { Region, Resource } from "@prisma/client";
import { getAllSettled } from "../util/getAllSettled";
import {
  updateRegion,
  getRegionsFromH3Array,
  handleCreateRegion,
  handleCreateRegions,
} from "./regionService";
import { Coordinate, InteractableResource, LatLngTuple, RegionWithResources, ScanResult } from "../types";
import config from "../config";
import { v4 as uuid } from 'uuid';


export const handleScan = async (
  fromLocation: Coordinate,
  scanDistance = 1
): Promise<ScanResult> => {
  const latitude = fromLocation.latitude;
  const longitude = fromLocation.longitude;

  // Get the h3 index based on the scan position
  const h3Index = h3.latLngToCell(latitude, longitude, config.region_h3_resolution);

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

  // * - - - - - Update each region - - - - -
  const updatedRegions = await getAllSettled<RegionWithResources>(
    regions.map((r) => updateRegion(r.id))
  );

  // expect that every region was sucessfully updated
  if (updatedRegions.length !== h3Group.length) {
    throw new Error("Error attempting to update regions");
  }

  // The scanRegion is a h3 of size `config.interactable_h3_resolution` which is the
  // basis for calculating which interactables the user can interact with and will
  // be the location of any placed equipment
  const scanRegion = h3.latLngToCell(latitude, longitude, config.interactable_h3_resolution)

  // Get resources from the updated regions and convert to interactables
  const resourceInteractables = updatedRegions
    .map((reg): InteractableResource[] => {
      
      // loop through region's resources
      return reg.resources.map((r) => {
        
        const latLngCenter = h3.cellToLatLng(r.h3Index);

        const distanceFromScanRegionCenter = h3.greatCircleDistance(latLngCenter, h3.cellToLatLng(scanRegion), h3.UNITS.m)

        const interactableResource: InteractableResource = {
          id: uuid(), // we are giving the client a random uuid for each interactable
          type: "resource",
          location: [latLngCenter[0], latLngCenter[1]],
          distanceFromScanRegionCenter: distanceFromScanRegionCenter, // m?
          userCanInteract: Boolean(
            distanceFromScanRegionCenter <= config.user_interact_distance
          ),
          data: r
        };

        return interactableResource
      });
    })
    .flat();

  const result: ScanResult = {
    metadata: {
      scannedLocation: [latitude, longitude],
    },
    scanPolygon: getH3Vertices(scanRegion),
    neighboringPolygons: h3.gridDisk(h3Index, scanDistance).map((neighbor) => getH3Vertices(neighbor)),
    interactables: [...resourceInteractables],
  };

  return result;
};

function getH3Vertices(h3Index: string): LatLngTuple[] {
  return h3.cellToVertexes(h3Index).map((i) => {
    const latLng = h3.vertexToLatLng(i)
    return [latLng[0], latLng[1]]
  })
}
