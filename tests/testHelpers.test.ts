import { Server } from "http";
import { logger } from "../src/logger/logger";
import { TestSingleton } from "./TestSingleton";
import { mockScan, resetPrisma } from "./testHelpers";
import { prisma } from "../src/prisma";

describe("testHelpers", () => {
  let server: Server;
  let idToken: string;
  let userUid: string;

  beforeAll(() => {
    logger.info("Starting test suite: testHelpers");
    server = TestSingleton.getInstance().server;
    idToken = TestSingleton.getInstance().idToken;
    userUid = TestSingleton.getInstance().userId;
  });

  afterEach(async () => {
    /* For now we are calling resetPrisma() after every test...Last clocked it around ~25ms on 6/26/23.
      Could re-time it again in the future to see how this changes. If concerned that this is too much,
      can move resetPrisma() closer to each test/test suite when data absolutely needs to be refreshed.
      */
    await resetPrisma();
  });

  it("should perform a mockScan without error and create the expected spawn regions and spawned resources", async () => {
    // verify state of database prior
    const preScan_spawnRegions = await prisma.spawnRegion.findMany();
    const preScan_spawnedResources = await prisma.spawnedResource.findMany();

    expect(preScan_spawnRegions).toHaveLength(0);
    expect(preScan_spawnedResources).toHaveLength(0);

    // perform a scan request with mocked logic
    await mockScan(server, idToken);

    const postScan_spawnRegions = await prisma.spawnRegion.findMany();
    const postScan_spawnedResources = await prisma.spawnedResource.findMany();

    expect(postScan_spawnRegions).toHaveLength(7);
    expect(postScan_spawnedResources).toHaveLength(3);
  });
});
