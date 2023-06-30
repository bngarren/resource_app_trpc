import { PrismaClient } from "@prisma/client";

export const setupBaseSeed = async (_prisma: PrismaClient) => {
  // Create our test User
  const testUser = await _prisma.user.create({
    data: {
      email: "testUser@gmail.com",
      firebase_uid: "aNYKOoPl8qeczPnZeNeuFiffxLf1",
    },
  });

  // Create some Resources
  await _prisma.resource.createMany({
    data: [
      {
        url: "gold",
        name: "Gold",
        resourceType: "REGULAR",
        rarity: "COMMON",
      },
      {
        url: "silver",
        name: "Silver",
        resourceType: "REGULAR",
        rarity: "COMMON",
      },
      {
        url: "temuride",
        name: "Temuride",
        resourceType: "ARCANE_ELEMENT",
        rarity: "RARE",
      },
    ],
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
