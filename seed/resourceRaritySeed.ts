import { Prisma, ResourceRarityLevel } from "@prisma/client";

export const resourceRaritySeed: Prisma.ResourceRarityCreateManyInput[] = [
  {
    level: ResourceRarityLevel.VERY_COMMON,
    name: "Very Common",
    likelihood: 6,
  },
  {
    level: ResourceRarityLevel.COMMON,
    name: "Common",
    likelihood: 5,
  },
  {
    level: ResourceRarityLevel.UNCOMMON,
    name: "Uncommon",
    likelihood: 4,
  },
  {
    level: ResourceRarityLevel.RARE,
    name: "Rare",
    likelihood: 3,
  },
  {
    level: ResourceRarityLevel.EPIC,
    name: "Epic",
    likelihood: 2,
  },
  {
    level: ResourceRarityLevel.LEGENDARY,
    name: "Legendary",
    likelihood: 1,
  },
];
