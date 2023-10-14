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
  userUid: z.string(), // TODO: is userUid needed? We could assume the harvester owner is collecting..,
  harvesterId: z.string(),
});

/**
 * The input schema for the "/harvester.reclaim" endpoint
 */
export const harvesterReclaimRequestSchema = z.object({
  harvesterId: z.string(),
});

/**
 * The input schema for the "/harvester.addEnergy" endpoint
 */
export const harvesterAddEnergyRequestSchema = z.object({
  harvesterId: z.string(),
  energySourceId: z.string(),
  amount: z.number().int().min(0),
});

/**
 * The input schema for the "/harvester.removeEnergy" endpoint
 */
export const harvesterRemoveEnergyRequestSchema = z.object({
  harvesterId: z.string(),
  energySourceId: z.string(),
  amount: z.number().int().min(0),
});

export const arcaneEnergyResourceMetadataSchema = z.object({
  energyEfficiency: z.number().min(0).max(1),
});
