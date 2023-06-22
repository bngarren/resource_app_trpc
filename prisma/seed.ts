import { logger } from "./../src/logger/logger";
import { Prisma, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/*

model User {
  id                 String              @id @default(uuid())
  email              String              @unique
  username           String?
  UserInventoryItems UserInventoryItem[]
  Harvesters         Harvester[]
}

*/

const seed_user: Prisma.UserCreateInput = {
  email: "bngarren@gmail.com",
};

const seed_resource_1: Prisma.ResourceCreateWithoutSpawnedResourcesInput = {
  url: "gold",
  name: "Gold",
  resourceType: "REGULAR",
  rarity: "COMMON",
};

async function main() {
  // upsert -update or create
  const user = await prisma.user.upsert({
    where: {
      email: seed_user.email,
    },
    update: seed_user,
    create: seed_user,
  });

  logger.info(user, "Seeded test user");

  const resource = await prisma.resource.create({ data: seed_resource_1 });

  logger.info(resource, "Seeded test resource");

  const user_inventory_item = await prisma.userInventoryItem.create({
    data: {
      user: {
        connect: {
          id: user.id,
        },
      },
      itemId: resource.id,
      itemType: "RESOURCE",
      quantity: 10,
    },
  });

  logger.info(user_inventory_item, "Seeded test user_inventory_item");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    logger.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
