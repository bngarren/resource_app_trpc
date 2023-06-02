import { Prisma, Resource } from "@prisma/client";
import selectRandom from "../util/selectRandom";
import { createResource, createResources } from "../queries/queryResource";

// TODO move somewhere else
const RESOURCE_NAMES = ["Gold", "Silver", "Iron", "Copper"];

export const createRandomResourceModel = (
    regionId: number,
    h3Index: string,
): Omit<Resource, "id"> => {

    const [name] = selectRandom(RESOURCE_NAMES, 1);

    return {
      name: name,
      regionId: regionId,
      h3Index: h3Index,
      quantityInitial: 100,
      quantityRemaining: 100,
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