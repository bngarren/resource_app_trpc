import { Prisma, ResourceRarityLevel, ResourceType } from "@prisma/client";

export const resourcesSeed: Prisma.ResourceCreateManyInput[] = [
  // REGULAR
  {
    url: "gold",
    name: "Gold",
    resourceType: ResourceType.REGULAR,
    resourceRarityLevel: ResourceRarityLevel.RARE,
  },
  {
    url: "stone",
    name: "Stone",
    resourceType: ResourceType.REGULAR,
    resourceRarityLevel: ResourceRarityLevel.VERY_COMMON,
  },
  {
    url: "silver",
    name: "Silver",
    resourceType: ResourceType.REGULAR,
    resourceRarityLevel: ResourceRarityLevel.UNCOMMON,
  },
  {
    url: "copper",
    name: "Copper",
    resourceType: ResourceType.REGULAR,
    resourceRarityLevel: ResourceRarityLevel.COMMON,
  },

  // ARCANE ELEMENTS
  {
    url: "temuride",
    name: "Temuride",
    resourceType: ResourceType.ARCANE_ELEMENT,
    resourceRarityLevel: ResourceRarityLevel.EPIC,
  },
  {
    url: "spectrite",
    name: "Spectrite",
    resourceType: ResourceType.ARCANE_ELEMENT,
    resourceRarityLevel: ResourceRarityLevel.RARE,
  },

  // ARCANE ENERGY
  {
    url: "arcane_flux",
    name: "Arcane Flux",
    energyEfficiency: 0.2,
    resourceType: ResourceType.ARCANE_ENERGY,
    resourceRarityLevel: ResourceRarityLevel.COMMON,
  },
  {
    url: "arcane_quanta",
    name: "Arcane Quanta",
    energyEfficiency: 0.6,
    resourceType: ResourceType.ARCANE_ENERGY,
    resourceRarityLevel: ResourceRarityLevel.EPIC,
  },
  {
    url: "arcane_radiance",
    name: "Arcane Radiance",
    energyEfficiency: 0.8,
    resourceType: ResourceType.ARCANE_ENERGY,
    resourceRarityLevel: ResourceRarityLevel.LEGENDARY,
  },
];
