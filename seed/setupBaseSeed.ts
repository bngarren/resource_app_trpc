import { PrismaClient, ResourceType } from "@prisma/client";
import { resourcesSeed } from "./resourcesSeed";
import { resourceRaritySeed } from "./resourceRaritySeed";
import { logger } from "../src/main";
import { TEST_USER } from "../tests/testHelpers";
import config from "../src/config";
/**
 * ### Seeds the database (via the given Prisma client)
 * - Adds testUser@gmail.com with a real Firebase uid
 * - Adds 3 resources
 * - Adds 1 user inventory item (gold) for testUser
 * - Adds 1 user inventory item (Basic harvester) for testUser
 * @param _prisma
 */
export const setupBaseSeed = async (_prisma: PrismaClient) => {
  const startSeedTime = Date.now();

  // - - - - - Create test user - - - - -
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

  // - - - - - Create Resources - - - - -

  // first, verify the energy Efficiency property
  resourcesSeed.forEach((r) => {
    switch (r.resourceType) {
      case ResourceType.ARCANE_ENERGY:
        if (r.energyEfficiency == null) {
          throw new Error(`Missing energyEfficiency for ${r.url}`);
        }
        break;
      default:
        break;
    }
  });

  await _prisma.resource.createMany({
    data: resourcesSeed,
  });

  // - - - - - Create User inventory items - - - - -

  // Create gold
  const gold = await _prisma.resource.findUniqueOrThrow({
    where: {
      url: "gold",
    },
  });

  // now create the UserInventoryItem
  await _prisma.resourceUserInventoryItem.create({
    data: {
      user: {
        connect: {
          id: testUser.id,
        },
      },
      item: {
        connect: {
          id: gold.id,
        },
      },
      itemType: "RESOURCE",
      quantity: 10,
    },
  });

  // Create arcane quanta (energy)
  const arcaneQuanta = await _prisma.resource.findUniqueOrThrow({
    where: {
      url: "arcane_quanta",
    },
  });

  // now create the UserInventoryItem
  await _prisma.resourceUserInventoryItem.create({
    data: {
      user: {
        connect: {
          id: testUser.id,
        },
      },
      item: {
        connect: {
          id: arcaneQuanta.id,
        },
      },
      itemType: "RESOURCE",
      quantity: 100,
    },
  });

  // - - - - - Create Harvester - - - - -
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
  await _prisma.harvesterUserInventoryItem.create({
    data: {
      user: {
        connect: {
          id: testUser.id,
        },
      },
      item: {
        connect: {
          id: harvesterId,
        },
      },
      itemType: "HARVESTER",
      quantity: 1,
    },
  });

  const endSeedTime = Date.now();
  const durationSeedTime = endSeedTime - startSeedTime;

  if (config.should_log_seed_results) {
    logSeedResults(_prisma, durationSeedTime);
  }
};

async function logSeedResults(prisma: PrismaClient, duration: number) {
  const count_resources = await prisma.resource.count();
  const count_spawnRegions = await prisma.spawnRegion.count();
  const count_spawnedResources = await prisma.spawnedResource.count();
  const testUser = await prisma.user.findUnique({
    where: {
      email: TEST_USER.email,
    },
    include: {
      resourceUserInventoryItems: {
        select: {
          id: true,
          item: {
            select: {
              id: true,
              name: true,
              url: true,
            },
          },
          quantity: true,
        },
      },
      harvesterUserInventoryItems: {
        select: {
          id: true,
          item: {
            select: {
              id: true,
              name: true,
            },
          },
          quantity: true,
        },
      },
    },
  });

  logger.info(
    {
      count_resources,
      count_spawnRegions,
      count_spawnedResources,
      testUser,
    },
    `[func setupBaseSeed] Seeding complete, which took ${duration} ms.`,
  );
}
