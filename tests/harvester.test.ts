import { getResourceUserInventoryItemByUrl } from "./../src/services/userInventoryService";
import {
  harvesterCollectRequestSchema,
  harvesterDeployRequestSchema,
  harvesterReclaimRequestSchema,
  harvesterTransferEnergyRequestSchema,
  scanRequestSchema,
} from "./../src/schema/index";
import {
  calculatePeriodHarvested,
  verifyArcaneEnergyResource,
} from "./../src/services/harvesterService";
import * as h3 from "h3-js";
import { TestSingleton } from "./TestSingleton";
import {
  AuthenticatedRequester,
  getDataFromTRPCResponse,
  harvestRegion,
  mockScan,
  resetPrisma,
  scanAndDeployHarvester,
  throwIfBadStatus,
  transformQueryLog,
} from "./testHelpers";
import { Server } from "http";
import { logger } from "../src/logger/logger";
import { prisma } from "../src/prisma";
import { Harvester, HarvesterUserInventoryItem, User } from "@prisma/client";
import {
  calculateRemainingEnergy,
  getHarvestOperationsForHarvester,
  isHarvesterDeployed,
} from "../src/services/harvesterService";
import {
  getUserInventoryItemWithItemId,
  getUserInventoryItems,
} from "../src/services/userInventoryService";
import {
  HarvesterTransferEnergyRequestOutput,
  ScanRequestOutput,
} from "../src/types/trpcTypes";

import config from "../src/config";
import {
  addDays,
  addHours,
  addMinutes,
  addSeconds,
  compareAsc,
  differenceInMilliseconds,
  hoursToMinutes,
  isSameSecond,
  minutesToSeconds,
  parseISO,
  subHours,
  subSeconds,
} from "date-fns";
import * as HarvesterService from "../src/services/harvesterService";
import * as QueryHarvester from "../src/queries/queryHarvester";
import { prisma_updateHarvesterById } from "../src/queries/queryHarvester";
import {
  prisma_getResourceByUrl,
  prisma_getSpawnedResourcesForSpawnRegion,
  prisma_updateSpawnedResources,
} from "../src/queries/queryResource";

describe("/harvester", () => {
  let server: Server;
  let idToken: string;
  let userUid: string;
  let requester: AuthenticatedRequester;

  beforeAll(() => {
    logger.info("Starting test suite: /harvester");
    server = TestSingleton.getInstance().server;
    idToken = TestSingleton.getInstance().idToken;
    userUid = TestSingleton.getInstance().userId;
    requester = new AuthenticatedRequester(server, idToken);
  });

  afterEach(async () => {
    /* For now we are calling resetPrisma() after every test...Last clocked it around ~25ms on 6/26/23.
    Could re-time it again in the future to see how this changes. If concerned that this is too much,
    can move resetPrisma() closer to each test/test suite when data absolutely needs to be refreshed.
    */
    await resetPrisma();
  });

  // - - - - - DEPLOY - - - - -
  describe("/harvester.deploy", () => {
    let testUser: User;
    let testHarvester: Harvester;

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
      const res1 = await requester.send("POST", "/harvester.deploy", {
        harvesterId: null,
        harvestRegion: harvestRegion,
      });

      expect(res1.statusCode).toBe(400);

      const res2 = await requester.send("POST", "/harvester.deploy", {
        harvesterId: testHarvester.id,
        harvestRegion: null,
      });

      expect(res2.statusCode).toBe(400);
    });

    it("should return status code 404 (Not Found) for non-existent harvester id or harvestRegion", async () => {
      // fake harvesterId
      const res1 = await requester.send("POST", "/harvester.deploy", {
        harvesterId: "some-fake-harvester-id",
        harvestRegion: harvestRegion,
      });

      expect(res1.statusCode).toBe(404);

      // fake h3 cell
      const res2 = await requester.send("POST", "/harvester.deploy", {
        harvesterId: testHarvester.id,
        harvestRegion: "fake-h3-index",
      });

      expect(res2.statusCode).toBe(404);

      // wrong h3 cell resolution
      const res3 = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: "81587ffffffffff" }, // resolution=1
      );

      expect(res3.statusCode).toBe(404);
    });

    it("should return status code 409 (Conflict) if harvester has non-null deployedDate or h3Index (already deployed)", async () => {
      // simulate deployment before we make our request
      await prisma.harvester.update({
        where: {
          id: testHarvester.id,
        },
        data: {
          deployedDate: new Date(),
          h3Index: harvestRegion,
        },
      });

      const res = await requester.send("POST", "/harvester.deploy", {
        harvesterId: testHarvester.id,
        harvestRegion: harvestRegion,
      });

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

      const res = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        harvesterDeployRequestSchema,
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

      const res = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        harvesterDeployRequestSchema,
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
      const hasTestHarvester = (items: HarvesterUserInventoryItem[]) => {
        return items.some((item) => item.harvesterId === testHarvester.id);
      };

      // should be present before being deployed
      expect(hasTestHarvester(preDeploy_userInventory.harvesters)).toBe(true);

      const d = await requester.send(
        "POST",
        "/harvester.deploy",
        {
          harvesterId: testHarvester.id,
          harvestRegion: harvestRegion,
        },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(d);

      const postDeploy_userInventory = await getUserInventoryItems(testUser.id);

      // should be gone after it has been deployed
      expect(hasTestHarvester(postDeploy_userInventory.harvesters)).toBe(false);
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
      const res1 = await requester.send(
        "POST",
        "/scan",
        scanRequest,
        scanRequestSchema,
      );
      throwIfBadStatus(res1);

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
      const res2 = await requester.send(
        "POST",
        "/harvester.deploy",
        {
          harvesterId: testHarvester.id,
          harvestRegion: harvestRegion,
        },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(res2);

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

    it("should only create harvest operations for active spawned resources", async () => {
      // mock scan that generates 3 nearby spawned resources
      const mockScanResult = await mockScan(3, server, idToken);
      const mockScanRegion = h3.latLngToCell(
        mockScanResult.metadata.scannedLocation[0],
        mockScanResult.metadata.scannedLocation[1],
        config.harvest_h3_resolution,
      );

      const spawnRegion = await prisma.spawnRegion.findUniqueOrThrow({
        where: {
          h3Index: "892a3064093ffff",
        },
      });

      const spawnedResources = await prisma_getSpawnedResourcesForSpawnRegion(
        spawnRegion.id,
      );

      // make the first spawned resource 'inactive'
      const inactiveSpawnedResource = spawnedResources[0];
      await prisma_updateSpawnedResources([inactiveSpawnedResource.id], {
        isActive: false,
      });

      // Now deploy the testHarvester to the mock scan location
      const res1 = await requester.send(
        "POST",
        "/harvester.deploy",
        {
          harvesterId: testHarvester.id,
          harvestRegion: mockScanRegion,
        },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(res1);

      const postDeploy_harvestOperations =
        await prisma.harvestOperation.findMany({
          where: {
            harvesterId: testHarvester.id,
          },
        });

      // Should have 2 harvest operations (3 spawned resources - 1 inactive = 2 active)
      expect(postDeploy_harvestOperations).toHaveLength(2);
    });
  });

  // - - - - - COLLECT - - - - -
  describe("/harvester.collect", () => {
    let testUser: User;
    let testHarvester: Harvester;

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
    });

    it("should return status code 400 (Bad Request) if missing user uid or harvester id", async () => {
      const res1 = await requester.send("POST", "/harvester.collect", {
        userUid: null,
        harvesterId: "test",
      });

      expect(res1.statusCode).toBe(400);

      const res2 = await requester.send("POST", "/harvester.collect", {
        userUid: userUid,
        harvesterId: null,
      });

      expect(res2.statusCode).toBe(400);
    });
    it("should return status code 404 (Not Found) for non-existent user or harvester id", async () => {
      const res1 = await requester.send(
        "POST",
        "/harvester.collect",
        { userUid: "some-fake-uid", harvesterId: testHarvester.id },
        harvesterCollectRequestSchema,
      );
      expect(res1.statusCode).toBe(404);

      const res2 = await requester.send(
        "POST",
        "/harvester.collect",
        { userUid: userUid, harvesterId: "some-fake-harvester-id" },
        harvesterCollectRequestSchema,
      );
      expect(res2.statusCode).toBe(404);
    });

    it("should return status code 403 (Forbidden) if harvester is not owned by user", async () => {
      // make another user (not part of base seed)
      const anotherUser = await prisma.user.create({
        data: {
          email: "anotherUser@gmail.com",
          firebase_uid: "another-uid",
        },
      });

      // attempt request with wrong user + harvester
      const res = await requester.send(
        "POST",
        "/harvester.collect",
        { userUid: anotherUser.firebase_uid, harvesterId: testHarvester.id },
        harvesterCollectRequestSchema,
      );
      expect(res.statusCode).toBe(403);
    });

    it("should return status code 409 (Conflict) if harvester is not deployed", async () => {
      // Make sure it appears non-deployed
      expect(isHarvesterDeployed(testHarvester)).toBe(false);

      const res = await requester.send(
        "POST",
        "/harvester.collect",
        { userUid: userUid, harvesterId: testHarvester.id },
        harvesterCollectRequestSchema,
      );
      expect(res.statusCode).toBe(409);
    });

    // COLLECT - continued
    describe("after harvester deployed and energy added", () => {
      let t_0: Date;

      beforeEach(async () => {
        // Perform a mockScan and deploy test harvester
        await scanAndDeployHarvester(testHarvester.id, server, idToken);

        // Add energy
        // Get energy from testUser's inventory

        const _arcaneQuanta = await getResourceUserInventoryItemByUrl(
          "arcane_quanta",
          testUser.id,
        );

        // careful, use the item.id here, not the userinventoryitem id
        const arcaneQuanta = await verifyArcaneEnergyResource(
          _arcaneQuanta.item.id,
        );

        const res = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            energySourceId: arcaneQuanta.id,
            harvesterId: testHarvester.id,
            amount: 100, // *Must match what is in the base seed for user's inventory!
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res);

        const energyStartTime =
          getDataFromTRPCResponse<HarvesterTransferEnergyRequestOutput>(
            res,
          ).energyStartTime;

        if (energyStartTime == null)
          throw new Error(
            `Problem setting up test (transfer energy request didn't return energyStartTime)`,
          );

        // postgres returns datetime in ISO format
        t_0 = parseISO(energyStartTime);
      });

      it("should add correct amount of the resources collected from the harvester since startTime and reset the harvest operations", async () => {
        /* For this test to work, we are relying on a correct setup. i.e. check preceding beforeEach()
        
        We assume that we have just scanned the mockScan location and deployed our harvester there.
        
        We have added abundant energy which started the 3 harvest operations. This occurred at present time, t_0

        */

        // Verify that mockScan (from beforeEach()) gave us 3 spawned resources
        const spawnedResources = await prisma.spawnedResource.findMany();

        expect(spawnedResources).toHaveLength(3);

        const t_plus_6 = addHours(t_0, 6);

        // Now we mock the handleCollect to 'occur' at t_plus_6 hours
      });
    });
  });

  // - - - - - RECLAIM - - - - -
  describe("/harvester.reclaim", () => {
    let testUser: User;
    let testHarvester: Harvester;

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
      const res = await requester.send("POST", "/harvester.reclaim", {
        harvesterId: null,
      });

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

      const res = await requester.send(
        "POST",
        "/harvester.reclaim",
        { harvesterId: testHarvester.id },
        harvesterReclaimRequestSchema,
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

      const d = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(d);

      // Harvester (deployed) should no longer be in the user's inventory
      await expect(
        getUserInventoryItemWithItemId(
          testHarvester.id,
          "HARVESTER",
          testUser.id,
        ),
      ).rejects.toThrow();

      const r = await requester.send(
        "POST",
        "/harvester.reclaim",
        { harvesterId: testHarvester.id },
        harvesterReclaimRequestSchema,
      );
      throwIfBadStatus(r);

      expect(r.statusCode).toBe(200);

      // get current testHarvester
      testHarvester = await prisma.harvester.findFirstOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // The testHarvester should not be deployed anymore
      expect(isHarvesterDeployed(testHarvester)).toBe(false);

      // Harvester should once again be in the user's inventory
      await expect(
        getUserInventoryItemWithItemId(
          testHarvester.id,
          "HARVESTER",
          testUser.id,
        ),
      ).resolves.not.toThrow();
    });

    it("should clear/reset energy data for the reclaimed harvester and return remaining energy to user's inventory", async () => {
      // First, deploy the testHarvester
      const d = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(d);

      // Now add energy to harvester
      const _arcaneFlux = await prisma.resource.findUniqueOrThrow({
        where: {
          url: "arcane_flux",
        },
      });

      const arcaneFlux = await verifyArcaneEnergyResource(_arcaneFlux.id);

      const initialEnergy = 10;

      const h = await requester.send(
        "POST",
        "/harvester.transferEnergy",
        {
          harvesterId: testHarvester.id,
          energySourceId: arcaneFlux.id,
          amount: initialEnergy,
          useUserInventory: false, // don't try to take this energy from the user
        },
        harvesterTransferEnergyRequestSchema,
      );
      throwIfBadStatus(h);

      // Manually back-date the Harvester's energyStartTime to simulate time has passed
      await prisma_updateHarvesterById(testHarvester.id, {
        energyStartTime: subHours(new Date(), 1), // mimic 1 hour ago
      });

      const re = await requester.send(
        "POST",
        "/harvester.reclaim",
        { harvesterId: testHarvester.id },
        harvesterReclaimRequestSchema,
      );
      throwIfBadStatus(re);

      // get current testHarvester
      testHarvester = await prisma.harvester.findFirstOrThrow({
        where: {
          id: testHarvester.id,
        },
      });

      // confirm that energy data is removed
      expect(testHarvester.initialEnergy).toBeCloseTo(0);
      expect(testHarvester.energyStartTime).toBeNull();
      expect(testHarvester.energyEndTime).toBeNull();
      expect(testHarvester.energySourceId).toBeNull();

      // Get user's inventory
      const inv = await getUserInventoryItems(testHarvester.userId);
      // const playerInv = await getPlayerInventoryFromUserInventoryItems(inv);
      // console.log(playerInv);

      const invResource = inv.resources.find(
        (i) => i.resourceId === arcaneFlux.id,
      );

      if (invResource == null) throw new Error("Failed to reclaim energy");

      // Calculate how much energy we expect remaining (that should be added to inventory)
      const k = calculateRemainingEnergy(
        initialEnergy,
        60.0,
        arcaneFlux.energyEfficiency,
      );

      // Expect the difference between our calculation and the server to be small
      expect(invResource.quantity - k).toBeLessThanOrEqual(0.5);
    });

    it("should remove all harvest operations associated with the harvester", async () => {
      const latLng = h3.cellToLatLng(harvestRegion);

      // First, scan the area to generate new spawned resources
      const numberOfSpawnedResource = 3;
      await mockScan(numberOfSpawnedResource, server, idToken);

      // Then, deploy the testHarvester
      const d = await requester.send(
        "POST",
        "/harvester.deploy",
        { harvesterId: testHarvester.id, harvestRegion: harvestRegion },
        harvesterDeployRequestSchema,
      );
      throwIfBadStatus(d);

      // Since we use mockScan which creates nearby resources, we expect the
      // same number of harvest operations to be created
      const pre_harvestOperations = await getHarvestOperationsForHarvester(
        testHarvester.id,
      );

      expect(pre_harvestOperations.length).toBe(numberOfSpawnedResource);

      // Now reclaim the harvester
      const r = await requester.send(
        "POST",
        "/harvester.reclaim",
        { harvesterId: testHarvester.id },
        harvesterReclaimRequestSchema,
      );
      throwIfBadStatus(r);

      const post_harvestOperations = await getHarvestOperationsForHarvester(
        testHarvester.id,
      );

      expect(post_harvestOperations.length).toBe(0);
    });

    it("should collect all resources in the harvester and add them to the user's inventory", async () => {
      throw new Error("Not fully implemented");
    });
  });

  // - - - - - TRANSFER ENERGY - - - - -
  describe("/harvester.transferEnergy", () => {
    let testUser: User;
    let testHarvester: Harvester;

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

      // Perform a mockScan and deploy test harvester
      await scanAndDeployHarvester(testHarvester.id, server, idToken);
    });

    it("should return status code 400 (Bad Request) if harvester id, energySourceId, or amount is missing", async () => {
      const res1 = await requester.send("POST", "/harvester.transferEnergy", {
        energySourceId: "test",
        amount: 0,
      });

      expect(res1.statusCode).toBe(400);

      const res2 = await requester.send("POST", "/harvester.transferEnergy", {
        harvesterId: testHarvester.id,
        amount: 0,
      });

      expect(res2.statusCode).toBe(400);

      const res3 = await requester.send("POST", "/harvester.transferEnergy", {
        harvesterId: testHarvester.id,
        energySourceId: "test",
      });

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

      const res = await requester.send(
        "POST",
        "/harvester.transferEnergy",
        {
          harvesterId: testHarvester.id,
          energySourceId: "another-energy-source-id",
          amount: 10,
        },
        harvesterTransferEnergyRequestSchema,
      );

      expect(res.statusCode).toBe(409);
    });

    describe("add energy", () => {
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

        // Get energy from testUser's inventory
        // TODO: Need to actually implement getUserInventoryItemWithItem
        const _arcaneQuanta = await getResourceUserInventoryItemByUrl(
          "arcane_quanta",
          testUser.id,
        );

        // careful, use the item.id here, not the userinventoryitem id
        const arcaneQuanta = await verifyArcaneEnergyResource(
          _arcaneQuanta.item.id,
        );

        const requestTime = new Date();

        const amount = 10;
        const res = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res);

        const post_TestHarvester = await prisma.harvester.findUniqueOrThrow({
          where: {
            id: testHarvester.id,
          },
        });

        expect(post_TestHarvester.initialEnergy).toBe(10);

        // Expected energyEndTime calculation
        const expectedEnergyEndTime = addSeconds(
          requestTime,
          amount *
            60.0 *
            arcaneQuanta.energyEfficiency *
            config.base_minutes_per_arcane_energy_unit,
        );

        // Check if the API came up with the same energyEndTime as this test did
        const check = isSameSecond(
          expectedEnergyEndTime,
          post_TestHarvester.energyEndTime ?? 1,
        );
        expect(check).toBe(true);
      });

      it("should correctly add energy to a harvester that already has energy", async () => {
        // choose the energy resource
        const _arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const arcaneQuanta = await verifyArcaneEnergyResource(_arcaneQuanta.id);

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
        const res = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res);

        const post1_TestHarvester = await prisma.harvester.findUniqueOrThrow({
          where: {
            id: testHarvester.id,
          },
        });

        // 5 units remaining at the time that
        // new energy is added. 5 + 3 = 8
        const r =
          calculateRemainingEnergy(
            initialEnergy,
            hoursToMinutes(hoursRunning),
            arcaneQuanta.energyEfficiency,
          ) + amount;

        expect(post1_TestHarvester.initialEnergy - r).toBeLessThanOrEqual(0.01); // equal within 0.01

        // the new energyEndTime should be based on the new initialEnergy
        const e = addSeconds(
          requestTime,
          minutesToSeconds(
            r *
              (config.base_minutes_per_arcane_energy_unit *
                arcaneQuanta.energyEfficiency),
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
        await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
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
          calculateRemainingEnergy(
            post1_TestHarvester.initialEnergy,
            secondsRunning / 60.0,
            arcaneQuanta.energyEfficiency,
          ) + amount;

        expect(post2_TestHarvester.initialEnergy - k).toBeLessThanOrEqual(0.01); // equal within 0.01
      });

      // TODO: WIP
      it("should deploy harvester and accurately store priorHarvested as energy is added over time", async () => {
        /*
        The premise of this testing strategy is that we deploy a harvester and mock the handleTransferEnergy
        calls so that we manually control the start times.
        
        In other words, we need fine control over the exact energyStartTime of the harvester and each
        harvest operation so that we can calculate and test endTimes at various intervals in the "future"
        from the starting point. If we try to deploy a harvester at current/present time, it's hard to
        "advance time" and test the result.
        
        Overall, we want to test specific intervals of time in a chronological fashion
        (as a harvester operates in real time) and see if the appopriate energy is being used and
        amount of resource being harvested is correct, depending on if energy is present or
        runs out and if the resetDate is passed.
  
        * This below tests depend on certain hard-coded variables, that if changed, must also be adjusted below *
        The testing schedule:
        - Deploy harvester and manually "fix"/mock the resetDate of the spawnRegion to T+12 hours
        - INITIAL ENERGY - At time 0 (t_0), add 2 units of energy. This will provide a certain duration of energy. Ideally ~2 hours.
        - ENERGY DEPLETED - At t_plus_3, we add 20 units of energy. During the update harvest operations logic, we want to correctly
        calculate the priorHarvested based on the energy running out at 2 hours. 
        - ENERGY OKAY - At t_plus_6, we add 50 units of energy. We should have had enough energy to carry us through the last 3 hours,
        therefore the calculated priorHarvested should reflect this.
        - RESOURCE DEPLETED - At t_plus_24, we add 50 units of energy. The resources should have become stale/inactive at T+12,
        therefore the harvest operations were only able to harvest from T+6 to T+12.
        */

        // Fake times, for consistency
        const t_0 = new Date(2022, 8, 16, 6, 0, 0);
        const t_plus_3 = addHours(t_0, 3);
        const t_plus_6 = addHours(t_0, 6);
        const t_plus_12 = addHours(t_0, 12);
        const t_plus_24 = addHours(t_0, 24);
        const t_plus_30 = addHours(t_0, 30);

        // TODO: using base extraction rate only. Must FIX this when harvester's have their own extraction rate multiplier
        const extractionRate = config.base_units_per_minute_harvested;

        // Verify that mockScan (from beforeEach()) gave us 3 spawned resources
        const spawnedResources = await prisma.spawnedResource.findMany();

        expect(spawnedResources).toHaveLength(3);

        // "Fix" the spawn region's resetDate to occur at T+12 hours so we can verify how things work
        // after the spawned resources should be inactive
        await prisma.spawnRegion.updateMany({
          where: {
            id: spawnedResources[0].spawnRegionId,
          },
          data: {
            resetDate: t_plus_12,
          },
        });

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
        const _arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const arcaneQuanta = await verifyArcaneEnergyResource(_arcaneQuanta.id);

        const orig_handleTransferEnergy = HarvesterService.handleTransferEnergy;

        // Add initial energy at time T0
        const spy_handleTransferEnergy = jest
          .spyOn(HarvesterService, "handleTransferEnergy")
          .mockImplementation(
            (
              harvester: string | Harvester,
              amount: number,
              energySourceId: string,
              _atTime: Date | null,
              _activeUserId: string | null | undefined,
            ) => {
              return orig_handleTransferEnergy(
                harvester,
                amount,
                energySourceId,
                t_0,
                _activeUserId,
              );
            },
          );

        const amount_1 = 3;
        const res1 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount_1,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res1);

        const postAddEnergy1_testHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        const postAddEnergy1_harvestOperations =
          await prisma.harvestOperation.findMany({
            where: {
              harvesterId: testHarvester.id,
            },
          });

        // Assertions after 1st round of energy add
        expect(postAddEnergy1_testHarvester.initialEnergy).toBe(amount_1);
        // shouldn't have an priorHarvested after the first add energy
        postAddEnergy1_harvestOperations.forEach((harvestOperation) => {
          expect(harvestOperation.priorHarvested).toBe(0);
        });

        // Add energy at time T+3 hours
        spy_handleTransferEnergy.mockImplementation(
          (
            harvester: string | Harvester,
            amount: number,
            energySourceId: string,
            _atTime: Date | null,
            _activeUserId: string | null | undefined,
          ) => {
            return orig_handleTransferEnergy(
              harvester,
              amount,
              energySourceId,
              t_plus_3,
              _activeUserId,
            );
          },
        );

        // Add more energy (2nd round)
        const amount_2 = 20;
        const res2 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount_2,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res2);

        const postAddEnergy2_testHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        const postAddEnergy2_harvestOperations =
          await prisma.harvestOperation.findMany({
            where: {
              harvesterId: testHarvester.id,
            },
          });

        // 3 units of arcane quanta gave us 108 min.
        // *Since this is less than the 3 hour interval, we will use the energy duration
        const energyDurationMinutes_1 =
          amount_1 *
          config.base_minutes_per_arcane_energy_unit *
          arcaneQuanta.energyEfficiency;
        // 108 min * 5 units/min = 540 units

        const priorHarvested_1 = calculatePeriodHarvested(
          t_0,
          addMinutes(t_0, energyDurationMinutes_1),
          extractionRate,
        );

        postAddEnergy2_harvestOperations.forEach((harvestOperation) => {
          expect(harvestOperation.priorHarvested).toBeCloseTo(
            priorHarvested_1,
            1,
          );
        });

        // Next, add energy at T+6
        spy_handleTransferEnergy.mockImplementation(
          (
            harvester: string | Harvester,
            amount: number,
            energySourceId: string,
            _atTime: Date | null,
            _activeUserId: string | null | undefined,
          ) => {
            return orig_handleTransferEnergy(
              harvester,
              amount,
              energySourceId,
              t_plus_6,
              _activeUserId,
            );
          },
        );

        // Add more energy (3rd round)
        const amount_3 = 50;
        const res3 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount_3,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res3);

        const postAddEnergy3_testHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        const postAddEnergy3_harvestOperations =
          await prisma.harvestOperation.findMany({
            where: {
              harvesterId: testHarvester.id,
            },
          });

        // 50 units of arcane quanta gave us plenty of energy
        // *Since this is more than the 3 hour interval, we will use 3 hours

        const priorHarvested_2 =
          priorHarvested_1 +
          calculatePeriodHarvested(t_plus_3, t_plus_6, extractionRate);

        postAddEnergy3_harvestOperations.forEach((harvestOperation) => {
          expect(harvestOperation.priorHarvested).toBeCloseTo(
            priorHarvested_2,
            1,
          );
        });

        // Next, add energy at T+24
        spy_handleTransferEnergy.mockImplementation(
          (
            harvester: string | Harvester,
            amount: number,
            energySourceId: string,
            _atTime: Date | null,
            _activeUserId: string | null | undefined,
          ) => {
            return orig_handleTransferEnergy(
              harvester,
              amount,
              energySourceId,
              t_plus_24,
              _activeUserId,
            );
          },
        );

        // Add more energy (4th round)
        const amount_4 = 50;
        const res4 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount_4,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res4);

        const postAddEnergy4_testHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        const postAddEnergy4_harvestOperations =
          await prisma.harvestOperation.findMany({
            where: {
              harvesterId: testHarvester.id,
            },
          });

        // 50 units of arcane quanta gave us plenty of energy
        // * The resource will have been depleted at T+12 hours
        // So we calculate T+6 to T+12 only...6 hours

        const priorHarvested_3 =
          priorHarvested_2 +
          calculatePeriodHarvested(t_plus_6, t_plus_12, extractionRate);

        postAddEnergy4_harvestOperations.forEach((harvestOperation) => {
          expect(harvestOperation.priorHarvested).toBeCloseTo(
            priorHarvested_3,
            1,
          );
        });

        // Last, add energy at T+30
        spy_handleTransferEnergy.mockImplementation(
          (
            harvester: string | Harvester,
            amount: number,
            energySourceId: string,
            _atTime: Date | null,
            _activeUserId: string | null | undefined,
          ) => {
            return orig_handleTransferEnergy(
              harvester,
              amount,
              energySourceId,
              t_plus_30,
              _activeUserId,
            );
          },
        );

        // Add more energy (4th round)
        const amount_5 = 10;
        const res5 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount_5,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res5);

        const postAddEnergy5_testHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        const postAddEnergy5_harvestOperations =
          await prisma.harvestOperation.findMany({
            where: {
              harvesterId: testHarvester.id,
            },
          });

        // * All resources have been depleted, should not have changed priorHarvested

        const priorHarvested_4 = priorHarvested_3;

        postAddEnergy5_harvestOperations.forEach((harvestOperation) => {
          expect(harvestOperation.priorHarvested).toBeCloseTo(
            priorHarvested_4,
            1,
          );
        });

        spy_handleTransferEnergy.mockRestore();
      });

      it("should rollback updated harvest operations if update harvester fails (saga)", async () => {
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

        // save the pre_HarvestOperations
        // these harvest operations should not have startTime and endTime should be the resetDate of the spawnRegion
        const pre_HarvestOperations = await getHarvestOperationsForHarvester(
          pre_TestHarvester.id,
        );

        // Mock the prisma_updateHarvesterById function to throw Error
        const spy_prisma_updateHarvesterById = jest
          .spyOn(QueryHarvester, "prisma_updateHarvesterById")
          .mockRejectedValueOnce(
            new Error("Mock error - e.g. database problem"),
          );

        // choose the energy resource
        const arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const amount = 3;

        const res = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );

        try {
          throwIfBadStatus(res);
        } catch (error) {
          expect(error).toBeDefined();
        }

        const post_HarvestOperations = await getHarvestOperationsForHarvester(
          pre_TestHarvester.id,
        );

        // There should have been no net change to harvest operations (i.e. changes were rolled back)
        expect(post_HarvestOperations).toEqual(pre_HarvestOperations);

        spy_prisma_updateHarvesterById.mockRestore();
      });

      it.skip("should test how many prisma queries for /harvester.transferEnergy, add energy", async () => {
        // choose the energy resource
        const arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const amount = 3;

        const queries: any[] = [];
        prisma.$on("query", (e) => {
          queries.push({
            "#": queries.length + 1,
            ...transformQueryLog({
              query: e.query,
              params: e.params,
              timestamp: e.timestamp,
            }),
          });
        });

        await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amount,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );

        // const metrics2 = await prisma.$metrics.json();
        // console.log(metrics2.counters);

        console.log(queries.sort((a, b) => compareAsc(a, b)));
        console.log(queries.length);
      });
    });

    describe("remove energy", () => {
      it("should correctly remove energy from a harvester with energy", async () => {
        /**
         * Will add energy to harvester at time 0 and then remove energy at some time
         * later on. The resulting initialEnergy at the new start time later on should reflect
         * the energy used during that period and the amount removed.
         */
        // verify harvester is deployed and without energy
        const pre_addEnergyHarvester = await prisma.harvester.findUniqueOrThrow(
          {
            where: {
              id: testHarvester.id,
            },
          },
        );

        if (
          !isHarvesterDeployed(pre_addEnergyHarvester) ||
          pre_addEnergyHarvester.initialEnergy != 0
        ) {
          throw new Error(
            `Problem with seeding harvester for this test (should be deployed and with initialEnergy 0): ${pre_addEnergyHarvester.initialEnergy}`,
          );
        }

        // choose the energy resource
        const _arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const arcaneQuanta = await verifyArcaneEnergyResource(_arcaneQuanta.id);

        const orig_handleTransferEnergy = HarvesterService.handleTransferEnergy;

        const t_0 = new Date(2022, 8, 16, 6, 0, 0);
        const t_plus_2 = addHours(t_0, 2);

        // Add initial energy at time T0
        const spy_handleTransferEnergy = jest
          .spyOn(HarvesterService, "handleTransferEnergy")
          .mockImplementation(
            (
              harvester: string | Harvester,
              amount: number,
              energySourceId: string,
              _atTime: Date | null,
              _activeUserId: string | null | undefined,
            ) => {
              return orig_handleTransferEnergy(
                harvester,
                amount,
                energySourceId,
                t_0,
                _activeUserId,
              );
            },
          );

        const amountAdd = 20;
        const res1 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amountAdd,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res1);

        const post_addEnergyHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        expect(post_addEnergyHarvester.initialEnergy).toBe(20);

        const energyRemainingT_plus_2 = calculateRemainingEnergy(
          amountAdd,
          differenceInMilliseconds(t_plus_2, t_0) / 60000.0,
          arcaneQuanta.energyEfficiency,
        );

        // Remove energy at t_plus_2 hours
        spy_handleTransferEnergy.mockImplementation(
          (
            harvester: string | Harvester,
            amount: number,
            energySourceId: string,
            _atTime: Date | null,
            _activeUserId: string | null | undefined,
          ) => {
            return orig_handleTransferEnergy(
              harvester,
              amount,
              energySourceId,
              t_plus_2,
              _activeUserId,
            );
          },
        );

        const amountRemove = -5;

        const res2 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amountRemove,
            useUserInventory: true, // want to actually return to user's inventory
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res2);

        const post_removeEnergyHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        expect(post_removeEnergyHarvester.initialEnergy).toBeCloseTo(
          energyRemainingT_plus_2 + amountRemove,
        );

        spy_handleTransferEnergy.mockRestore();
      });

      it("should return status 409 (Conflict) if removed energy causes harvester to have negative initialEnergy", async () => {
        // verify harvester is deployed and without energy
        const pre_addEnergyHarvester = await prisma.harvester.findUniqueOrThrow(
          {
            where: {
              id: testHarvester.id,
            },
          },
        );

        if (
          !isHarvesterDeployed(pre_addEnergyHarvester) ||
          pre_addEnergyHarvester.initialEnergy != 0
        ) {
          throw new Error(
            `Problem with seeding harvester for this test (should be deployed and with initialEnergy 0): ${pre_addEnergyHarvester.initialEnergy}`,
          );
        }

        // choose the energy resource
        const arcaneQuanta = await prisma_getResourceByUrl("arcane_quanta"); // from base seed

        const amountAdd = 5;
        const res1 = await requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amountAdd,
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );
        throwIfBadStatus(res1);

        const res2 = requester.send(
          "POST",
          "/harvester.transferEnergy",
          {
            harvesterId: testHarvester.id,
            energySourceId: arcaneQuanta.id,
            amount: amountAdd * -2, // remove twice as much
            useUserInventory: false, // god mode
          },
          harvesterTransferEnergyRequestSchema,
        );

        const post_removeEnergyHarvester =
          await prisma.harvester.findUniqueOrThrow({
            where: {
              id: testHarvester.id,
            },
          });

        await res2.expect(409);

        expect(post_removeEnergyHarvester.initialEnergy).toBeCloseTo(amountAdd);
      });
    });
  });
});
