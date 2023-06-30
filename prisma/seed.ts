import { setupBaseSeed } from "../seed/setupBaseSeed";
import { logger } from "./../src/logger/logger";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await setupBaseSeed(prisma);
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
