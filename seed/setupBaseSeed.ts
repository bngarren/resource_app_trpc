import { PrismaClient } from "@prisma/client";
import { resourcesSeed } from "./resourcesSeed";
import { resourceRaritySeed } from "./resourceRaritySeed";

/**
 * ### Seeds the database (via the given Prisma client)
 * - Adds testUser@gmail.com with a real Firebase uid
 * - Adds 3 resources
 * - Adds 1 user inventory item (gold) for testUser
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
};
