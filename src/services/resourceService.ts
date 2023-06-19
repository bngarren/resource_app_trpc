import { Prisma, Region, Resource } from "@prisma/client";
import selectRandom from "../util/selectRandom";
import { createResource, createResources } from "../queries/queryResource";
import { cellToChildren } from "h3-js";

// TODO move somewhere else
const RESOURCE_NAMES = ["Gold", "Silver", "Iron", "Copper"];

export const createRandomResourceModel = (
    regionId: number,
    h3Index: string,
): Prisma.ResourceCreateInput => {

    const [name] = selectRandom(RESOURCE_NAMES);

    // using "connect" is the idiomatic way to associate the new record with an existing record by its unique identifier
    return {
      name: name,
      region: {
        connect: {
            id: regionId
        }
      },
      h3Index: h3Index,
    }; 
}


export const handleCreateResource = async (
    resourceModel: Prisma.ResourceCreateInput,
    withResources = true
  ) => {
      return await createResource(resourceModel)
  };
  
  export const handleCreateResources = async (
      resourceModels: Prisma.ResourceCreateManyInput[],
      withResources = true
  ) => {
      return await createResources(resourceModels)
  }


  export const generateResourceModelsForRegion = (
    region: Region,
    quantity: [number, number],
    resourceH3Resolution: number
  ) => {
    // Get the children h3 indexes of this (parent) region at the specified h3 resolution
    // These are potential spots for a resource
    const potentials = cellToChildren(region.h3Index, resourceH3Resolution);
  
    // Select some of these spots randomly
    const selected = selectRandom(potentials, quantity);
  
    // Now create the resource models from these h3 indices
    const models = selected.map((s) => {
      return createRandomResourceModel(region.id, s);
    });
  
    return models;
  };