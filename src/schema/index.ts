import { z } from "zod";

export const userLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const scanRequestSchema = z.object({
  userLocation: userLocationSchema,
});

export const getUserInventoryRequestSchema = z.object({
  userUid: z.string(),
});

/**
 * The input schema for the "/harvester.deploy" endpoint
 */
export const harvesterDeployRequestSchema = z.object({
  harvesterId: z.string(),
  harvestRegion: z.string(), // h3 index
});

/**
 * The input schema for the "/harvester.collect" endpoint
 */
export const harvesterCollectRequestSchema = z.object({
  userUid: z.string(),
  harvesterId: z.string(),
});
