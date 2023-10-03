import * as h3 from "h3-js";
import { TestSingleton } from "./TestSingleton";
import {
  authenticatedRequest,
  getDataFromTRPCResponse,
  resetPrisma,
} from "./testHelpers";
import { Server } from "http";
import { logger } from "../src/logger/logger";
import { prisma } from "../src/prisma";
import { Harvester, User, UserInventoryItem } from "@prisma/client";
import {
  handleDeploy,
  isHarvesterDeployed,
} from "../src/services/harvesterService";
import {
  getUserInventoryItemWithItemId,
  getUserInventoryItems,
} from "../src/services/userInventoryService";
import { updateHarvesterById } from "../src/queries/queryHarvester";
import { ScanRequestOutput } from "../src/types/trpcTypes";
import { getResourceByUrl } from "../src/queries/queryResource";
import { arcaneEnergyResourceMetadataSchema } from "../src/schema";
import config from "../src/config";
import {
  addDays,
  addMinutes,
  addSeconds,
  hoursToMinutes,
  isSameMinute,
  isSameSecond,
  minutesToSeconds,
  subHours,
  subSeconds,
} from "date-fns";
import { validateWithZod } from "../src/util/validateWithZod";

describe("/harvester", () => {
  let server: Server;
  let idToken: string;
  let userUid: string;

  beforeAll(() => {
    logger.info("Starting test suite: /harvester");
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

  describe("/harvester.deploy", () => {
    let testUser: User;
    let testHarvester: Harvester;
    const harvestRegion = "8a2a30640907fff"; // Longwood Park, Boston at h3 resolution 10

    // Setup testUser and testHarvester
    beforeEach(async () => {
      testUser = await prisma.user.findUniqueOrThrow({
        where: {
          email: "testUser@gmail.com",
        },
      });

      const testHarvesterResult = await prisma.harvester.findFirst({
        where: {
          userId: testUser.id,
        },
      });

      if (!testHarvesterResult) {
        throw Error("Failed test due to seed data problem.");
      } else {
        testHarvester = testHarvesterResult;
      }

      // make the testHarvester not yet deployed
      await prisma.harvester.update({
        data: {
          deployedDate: null,
          h3Index: null,
        },
        where: {
          id: testHarvester.id,
        },
      });
    });

    it("should return status code 400 (Bad Request) if missing harvester id or harvestRegion", async () => {
      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: null, harvestRegion: harvestRegion },
      );

      expect(res1.statusCode).toBe(400);

      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: null },
      );

      expect(res2.statusCode).toBe(400);
    });

    it("should return status code 404 (Not Found) for non-existent harvester id or harvestRegion", async () => {
      // fake harvesterId
      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: "some-fake-harvester-id", harvestRegion: harvestRegion },
      );

      expect(res1.statusCode).toBe(404);

      // fake h3 cell
      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: "fake-h3-index" },
      );

      expect(res2.statusCode).toBe(404);

      // wrong h3 cell resolution
      const res3 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: "81587ffffffffff" }, // resolution=1
      );

      expect(res3.statusCode).toBe(404);
    });

    it("should return status code 409 (Conflict) if harvester has non-null deployedDate or h3Index (already deployed)", async () => {
      // deploy it before we make our request
      await handleDeploy(testHarvester.id, harvestRegion);

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
      );

      expect(res.statusCode).toBe(409);
    });

    it("should return status code 409 (Conflict) if another harvester (by same user) is already deployed to this location", async () => {
      // make the additional harvester
      const otherHarvester = await prisma.harvester.create({
        data: {
          name: "Other Harvester",
          deployedDate: new Date(),
          h3Index: harvestRegion,
          user: {
            connect: {
              id: testUser.id,
            },
          },
        },
      });

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
      );

      expect(res.statusCode).toBe(409);
    });

    it("should update the harvester with deployedDate and h3Index", async () => {
      const preDeploy_harvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // should be null to start
      expect(preDeploy_harvester.deployedDate).toBeNull();
      expect(preDeploy_harvester.h3Index).toBeNull();

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
      );

      expect(res.statusCode).toBe(200);

      const postDeploy_harvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // should be null to start
      expect(postDeploy_harvester.deployedDate).not.toBeNull();
      expect(postDeploy_harvester.h3Index).not.toBeNull();
    });

    it("should remove the harvester from the user's inventory after being deployed", async () => {
      const preDeploy_userInventory = await getUserInventoryItems(testUser.id);

      // func that checks if user inventory items contain the test harvester
      const hasTestHarvester = (items: UserInventoryItem[]) => {
        return items.some((item) => item.itemId === testHarvester.id);
      };

      // should be present before being deployed
      expect(hasTestHarvester(preDeploy_userInventory)).toBe(true);

      await authenticatedRequest(server, "POST", "/harvester.deploy", idToken, {
        harvesterId: testHarvester.id,
        harvestRegion: harvestRegion,
      });

      const postDeploy_userInventory = await getUserInventoryItems(testUser.id);

      // should be gone after it has been deployed
      expect(hasTestHarvester(postDeploy_userInventory)).toBe(false);
    });

    it("should create new HarvestOperations for each nearby SpawnedResource", async () => {
      // Scan at the harvest location first to ensure updated SpawnRegions and SpawnedResources
      const latLng = h3.cellToLatLng(harvestRegion);
      const scanRequest = {
        userLocation: {
          latitude: latLng[0],
          longitude: latLng[1],
        },
      };
      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/scan",
        idToken,
        scanRequest,
      );

      const data = getDataFromTRPCResponse<ScanRequestOutput>(res1);

      // is a resource and user can interact...These should be represented by HarvestOperations
      const interactableResources = data.interactables.filter(
        (i) => i.type === "resource" && i.userCanInteract === true,
      );

      // Ensure that no harvest operations currently exist for harvester
      const preDeploy_harvestOperations =
        await prisma.harvestOperation.findMany({
          where: {
            harvesterId: testHarvester.id,
          },
        });

      expect(preDeploy_harvestOperations).toHaveLength(0);

      // Now deploy the testHarvester to the same location we just scanned
      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        {
          harvesterId: testHarvester.id,
          harvestRegion: harvestRegion,
        },
      );

      const postDeploy_harvestOperations =
        await prisma.harvestOperation.findMany({
          where: {
            harvesterId: testHarvester.id,
          },
        });

      // Should have make as many HarvestOperations as there were interactable resources within range (user_can_interact)
      expect(postDeploy_harvestOperations).toHaveLength(
        interactableResources.length,
      );
    });
  });

  describe("/harvester.collect", () => {
    it("should return status code 400 (Bad Request) if missing user uid or harvester id", async () => {
      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: null, harvesterId: "test" },
      );

      expect(res1.statusCode).toBe(400);

      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: userUid, harvesterId: null },
      );

      expect(res2.statusCode).toBe(400);
    });
    it("should return status code 404 (Not Found) for non-existent user or harvester id", async () => {
      const testHarvester = await prisma.harvester.findFirst();

      if (!testHarvester) {
        throw Error("Failed test due to seed data problem.");
      }

      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: "some-fake-uid", harvesterId: testHarvester.id },
      );
      expect(res1.statusCode).toBe(404);

      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: userUid, harvesterId: "some-fake-harvester-id" },
      );
      expect(res2.statusCode).toBe(404);
    });

    it("should return status code 403 (Forbidden) if harvester is not owned by user", async () => {
      const testUser = await prisma.user.findUnique({
        where: {
          firebase_uid: userUid,
        },
      });

      if (!testUser) {
        throw Error("Failed test due to seed data problem.");
      }

      const harvester = await prisma.harvester.findFirst({
        where: {
          userId: testUser.id,
        },
      });

      if (!harvester) {
        throw Error("Failed test due to seed data problem.");
      }

      // make another user (not part of base seed)
      const anotherUser = await prisma.user.create({
        data: {
          email: "anotherUser@gmail.com",
          firebase_uid: "another-uid",
        },
      });

      // attempt request with wrong user + harvester
      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: anotherUser.firebase_uid, harvesterId: harvester.id },
      );
      expect(res.statusCode).toBe(403);
    });

    it("should return status code 409 (Conflict) if harvester is not deployed", async () => {
      const harvester = await prisma.harvester.findFirst();

      if (!harvester) {
        throw Error("Failed test due to seed data problem.");
      }

      // make sure harvester doesn't appear deployed
      // i.e., nullify the h3Index and deployedDate
      await prisma.harvester.update({
        where: {
          id: harvester.id,
        },
        data: {
          h3Index: null,
          deployedDate: null,
        },
      });

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.collect",
        idToken,
        { userUid: userUid, harvesterId: harvester.id },
      );
      expect(res.statusCode).toBe(409);
    });
  });

  describe("/harvester.reclaim", () => {
    let testUser: User;
    let testHarvester: Harvester;
    const harvestRegion = "8a2a30640907fff"; // Longwood Park, Boston at h3 resolution 10

    // Setup testUser and testHarvester
    beforeEach(async () => {
      testUser = await prisma.user.findUniqueOrThrow({
        where: {
          email: "testUser@gmail.com",
        },
      });

      const testHarvesterResult = await prisma.harvester.findFirst({
        where: {
          userId: testUser.id,
        },
      });

      if (!testHarvesterResult) {
        throw Error("Failed test due to seed data problem.");
      } else {
        testHarvester = testHarvesterResult;
      }

      // make the testHarvester not yet deployed
      await prisma.harvester.update({
        data: {
          deployedDate: null,
          h3Index: null,
        },
        where: {
          id: testHarvester.id,
        },
      });
    });

    it("should return status code 400 (Bad Request) if missing harvester id", async () => {
      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.reclaim",
        idToken,
        { harvesterId: null },
      );

      expect(res.statusCode).toBe(400);
    });

    it("should return status code 409 (Conflict) if harvester is not deployed", async () => {
      // get current testHarvester
      testHarvester = await prisma.harvester.findFirstOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // The testHarvester should start off not deployed
      expect(isHarvesterDeployed(testHarvester)).toBe(false);

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.reclaim",
        idToken,
        { harvesterId: testHarvester.id },
      );

      expect(res.statusCode).toBe(409);
    });

    it("should return status 200 for success, un-deploy the harvester, and return the harvester to the user's inventory", async () => {
      // Harvester should start off in the user's inventory
      expect(
        getUserInventoryItemWithItemId(
          testHarvester.id,
          "HARVESTER",
          testUser.id,
        ),
      ).resolves.not.toThrow();

      // First, deploy the testHarvester
      try {
        await authenticatedRequest(
          server,
          "POST",
          "/harvester.deploy",
          idToken,
          { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        );
      } catch (error) {
        console.error(
          `Couldn't complete /harvester.reclaim test due to error with /harvester.deploy`,
          error,
        );
      }

      // Harvester (deployed) should no longer be in the user's inventory
      expect(
        getUserInventoryItemWithItemId(
          testHarvester.id,
          "HARVESTER",
          testUser.id,
        ),
      ).rejects.toThrow();

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.reclaim",
        idToken,
        { harvesterId: testHarvester.id },
      );

      // get current testHarvester
      testHarvester = await prisma.harvester.findFirstOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // The testHarvester should not be deployed anymore
      expect(isHarvesterDeployed(testHarvester)).toBe(false);

      // Harvester should once again be in the user's inventory
      expect(
        getUserInventoryItemWithItemId(
          testHarvester.id,
          "HARVESTER",
          testUser.id,
        ),
      ).resolves.not.toThrow();

      expect(res.statusCode).toBe(200);
    });

    it("should clear/reset energy data for the reclaimed harvester", async () => {
      // First, deploy the testHarvester
      try {
        await authenticatedRequest(
          server,
          "POST",
          "/harvester.deploy",
          idToken,
          { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        );
      } catch (error) {
        console.error(
          `Couldn't complete /harvester.reclaim test due to error with /harvester.deploy`,
          error,
        );
      }

      // Now manually add some energy data via updateHarvester
      // TODO: could eventually use actual endpoint calls

      const arcaneFlux = await prisma.resource.findUniqueOrThrow({
        where: {
          url: "arcane_flux",
        },
      });

      await updateHarvesterById(testHarvester.id, {
        initialEnergy: 100,
        energyStartTime: new Date(),
        energyEndTime: new Date(Date.now() + 3600 * 1000 * 24), // add 24 hours, not important...
        energySourceId: arcaneFlux.id,
      });

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.reclaim",
        idToken,
        { harvesterId: testHarvester.id },
      );

      // get current testHarvester
      testHarvester = await prisma.harvester.findFirstOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // confirm that energy data is removed
      expect(testHarvester.initialEnergy).toBeFalsy();
      expect(testHarvester.energyStartTime).toBeNull();
      expect(testHarvester.energyEndTime).toBeNull();
      expect(testHarvester.energySourceId).toBeNull();
    });

    it("should collect all resources in the harvester and add them to the user's inventory", async () => {
      throw new Error("Not implemented");
    });
  });

  describe("/harvester.addEnergy", () => {
    let testUser: User;
    let testHarvester: Harvester;
    const harvestRegion = "8a2a30640907fff"; // Longwood Park, Boston at h3 resolution 10

    // Setup testUser and testHarvester
    beforeEach(async () => {
      testUser = await prisma.user.findUniqueOrThrow({
        where: {
          email: "testUser@gmail.com",
        },
      });

      const testHarvesterResult = await prisma.harvester.findFirst({
        where: {
          userId: testUser.id,
        },
      });

      if (!testHarvesterResult) {
        throw Error("Failed test due to seed data problem.");
      } else {
        testHarvester = testHarvesterResult;
      }

      // make the testHarvester deployed
      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.deploy",
        idToken,
        {
          harvesterId: testHarvester.id,
          harvestRegion: harvestRegion,
        },
      );
    });

    it("should return status code 400 (Bad Request) if harvester id, energySourceId, or amount is missing", async () => {
      const res1 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        { energySourceId: "test", amount: 0 },
      );

      expect(res1.statusCode).toBe(400);

      const res2 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        { harvesterId: testHarvester.id, amount: 0 },
      );

      expect(res2.statusCode).toBe(400);

      const res3 = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        { harvesterId: testHarvester.id, energySourceId: "test" },
      );

      expect(res3.statusCode).toBe(400);
    });

    it("should return status code 409 (Conflict) if the added energy's type is not the same as what is already in the harvester", async () => {
      // manually set the energy source type
      await prisma.harvester.update({
        where: {
          id: testHarvester.id,
        },
        data: {
          energySourceId: "fake-energy-source-id",
        },
      });

      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        {
          harvesterId: testHarvester.id,
          energySourceId: "another-energy-source-id",
          amount: 10,
        },
      );

      expect(res.statusCode).toBe(409);
    });

    it("should correctly add energy to a harvester without energy", async () => {
      // verify harvester is deployed and without energy
      const pre_TestHarvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      if (
        !isHarvesterDeployed(pre_TestHarvester) ||
        pre_TestHarvester.initialEnergy != 0
      ) {
        throw new Error(
          `Problem with seeding harvester for this test (should be deployed and with initialEnergy 0): ${pre_TestHarvester.initialEnergy}`,
        );
      }

      // choose the energy resource
      const arcaneQuanta = await getResourceByUrl("arcane_quanta"); // from base seed

      const requestTime = new Date();

      const amount = 10;
      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        {
          harvesterId: testHarvester.id,
          energySourceId: arcaneQuanta.id,
          amount: amount,
        },
      );

      const post_TestHarvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      expect(post_TestHarvester.initialEnergy).toBe(10);

      // Get the metadata for the energy
      // Validate and parse the metadata using Zod
      const metadata = validateWithZod(
        arcaneEnergyResourceMetadataSchema,
        arcaneQuanta.metadata,
        `metadata for arcane_quanta`,
      );

      // Expected energyEndTime calculation
      const expectedEnergyEndTime = addMinutes(
        requestTime,
        amount *
          metadata.energyEfficiency *
          config.base_minutes_per_arcane_energy_unit,
      );

      // Check if the API came up with the same energyEndTime as this test did
      const check = isSameMinute(
        expectedEnergyEndTime,
        post_TestHarvester.energyEndTime ?? 1,
      );
      expect(check).toBe(true);
    });

    it("should correctly add energy to a harvester that already has energy", async () => {
      // choose the energy resource
      const arcaneQuanta = await getResourceByUrl("arcane_quanta"); // from base seed

      // setup our test harvester to already have energy (running)
      const initialEnergy = 10.0;
      const hoursRunning = 3;
      await prisma.harvester.update({
        where: {
          id: testHarvester.id,
        },
        data: {
          initialEnergy: initialEnergy,
          energyStartTime: subHours(new Date(), hoursRunning), // energy added 3 hours ago
          energyEndTime: addDays(new Date(), 3), // pretend this energy will last for 3 days, not important for this test
          energySourceId: arcaneQuanta.id,
        },
      });

      // verify harvester is deployed and with some initialEnergy
      const pre_TestHarvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      if (
        !isHarvesterDeployed(pre_TestHarvester) ||
        pre_TestHarvester.initialEnergy !== initialEnergy
      ) {
        throw new Error(
          `Problem with seeding harvester for this test (should be deployed and with initialEnergy=10): ${pre_TestHarvester.initialEnergy}`,
        );
      }

      let requestTime = new Date();

      // Now add more units of energy to the harvester
      let amount = 3;
      const res = await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        {
          harvesterId: testHarvester.id,
          energySourceId: arcaneQuanta.id,
          amount: amount,
        },
      );

      const post1_TestHarvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // Get the metadata for the energy
      // Validate and parse the metadata using Zod
      const metadata = validateWithZod(
        arcaneEnergyResourceMetadataSchema,
        arcaneQuanta.metadata,
        `metadata for arcane_quanta`,
      );

      // If initialEnergy of 10 units has run for 3 hours at 0.6 energyEfficiency (Arcane Quanta),
      // this would leave 10units - 180 min/36 min per unit = 5 units remaining at the time that
      // new energy is added. 5 + 3 = 8
      const r =
        Math.max(
          0,
          initialEnergy -
            hoursToMinutes(hoursRunning) /
              (config.base_minutes_per_arcane_energy_unit *
                metadata.energyEfficiency),
        ) + amount;
      expect(post1_TestHarvester.initialEnergy - r).toBeLessThanOrEqual(0.01); // equal within 0.01

      // the new energyEndTime should be based on the new initialEnergy
      const e = addSeconds(
        requestTime,
        minutesToSeconds(
          r *
            (config.base_minutes_per_arcane_energy_unit *
              metadata.energyEfficiency),
        ),
      );

      expect(isSameSecond(e, post1_TestHarvester.energyEndTime ?? 1)).toBe(
        true,
      ); // the "?? 1" is just avoiding a null check here...

      // * * * * * * * *
      // Now we will manually set the energyStartTime to 15 seconds ago so that we can test what happens
      // when we add another unit of energy in a short time frame

      const secondsRunning = 15;
      await prisma.harvester.update({
        where: {
          id: testHarvester.id,
        },
        data: {
          energyStartTime: subSeconds(new Date(), secondsRunning), // pretend it has been at least 15 seconds
        },
      });

      requestTime = new Date();

      // Now add 1 more unit of energy to the harvester
      amount = 1;
      await authenticatedRequest(
        server,
        "POST",
        "/harvester.addEnergy",
        idToken,
        {
          harvesterId: testHarvester.id,
          energySourceId: arcaneQuanta.id,
          amount: amount,
        },
      );

      const post2_TestHarvester = await prisma.harvester.findUniqueOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // If initialEnergy of 8 units has run for 15 seconds at 0.6 energyEfficiency (Arcane Quanta),
      // this would leave 8units - 0.25 min/36 min per unit = 7.99 units remaining at the time that
      // new energy is added. 7.99 + 1 = 8.99

      const k =
        Math.max(
          0,
          post1_TestHarvester.initialEnergy -
            secondsRunning /
              60.0 /
              (config.base_minutes_per_arcane_energy_unit *
                metadata.energyEfficiency),
        ) + amount;
      expect(post2_TestHarvester.initialEnergy - k).toBeLessThanOrEqual(0.01); // equal within 0.01
    });
  });
});
