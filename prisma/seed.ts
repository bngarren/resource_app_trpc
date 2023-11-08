import { setupBaseSeed } from "../seed/setupBaseSeed";
import { logger } from "./../src/main";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await setupBaseSeed(prisma);

  const count = await prisma.resource.count();
  logger.info(`Finished base seed. There are ${count} Resource rows.`);
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
