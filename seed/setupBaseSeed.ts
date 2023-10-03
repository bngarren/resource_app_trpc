import { PrismaClient, ResourceType } from "@prisma/client";
import { resourcesSeed } from "./resourcesSeed";
import { resourceRaritySeed } from "./resourceRaritySeed";
import { arcaneEnergyResourceMetadataSchema } from "../src/schema";

/**
 * ### Seeds the database (via the given Prisma client)
 * - Adds testUser@gmail.com with a real Firebase uid
 * - Adds 3 resources
 * - Adds 1 user inventory item (gold) for testUser
 * - Adds 1 user inventory item (Basic harvester) for testUser
 * @param _prisma
 */
export const setupBaseSeed = async (_prisma: PrismaClient) => {
  // Create our test User
  const testUser = await _prisma.user.create({
    data: {
      email: "testUser@gmail.com",
      firebase_uid: "aNYKOoPl8qeczPnZeNeuFiffxLf1",
    },
  });

  // Create ResourceRarity options
  await _prisma.resourceRarity.createMany({
    data: resourceRaritySeed,
  });

  // Create some Resources

  // first, verify the metadata schema
  resourcesSeed.forEach((r) => {
    switch (r.resourceType) {
      case ResourceType.ARCANE_ENERGY:
        const validationResult = arcaneEnergyResourceMetadataSchema.safeParse(
          r.metadata,
        );
        if (!validationResult.success) {
          throw new Error(
            `Incorrect metadata for ${r.url} ${validationResult.error}`,
          );
        }
        break;
      default:
        break;
    }
  });

  await _prisma.resource.createMany({
    data: resourcesSeed,
  });

  // Create a user inventory item

  // first, get one of our resources to be our item
  const gold = await _prisma.resource.findUniqueOrThrow({
    where: {
      url: "gold",
    },
  });

  // now create the UserInventoryItem
  await _prisma.userInventoryItem.create({
    data: {
      user: {
        connect: {
          id: testUser.id,
        },
      },
      itemId: gold.id,
      itemType: "RESOURCE",
      quantity: 10,
    },
  });

  // Create a new Harvester associated with our test user
  const { id: harvesterId } = await _prisma.harvester.create({
    data: {
      name: "Basic Harvester",
      deployedDate: null,
      h3Index: null,
      user: {
        connect: {
          id: testUser.id,
        },
      },
    },
    select: {
      id: true,
    },
  });

  // now create the UserInventoryItem for the harvester
  await _prisma.userInventoryItem.create({
    data: {
      user: {
        connect: {
          id: testUser.id,
        },
      },
      itemId: harvesterId,
      itemType: "HARVESTER",
      quantity: 1,
    },
  });
};
