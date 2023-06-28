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
