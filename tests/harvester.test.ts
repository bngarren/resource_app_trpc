import { TestSingleton } from "./TestSingleton";
import { authenticatedRequest, resetPrisma } from "./testHelpers";
import { Server } from "http";
import { logger } from "../src/logger/logger";
import { prisma } from "../src/prisma";
import { Harvester, User, UserInventoryItem } from "@prisma/client";
import { handleDeploy } from "../src/services/harvesterService";
import { getUserInventoryItems } from "../src/services/userInventoryService";

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
    let harvestRegion: string;

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

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      harvestRegion = testHarvester.h3Index!;

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

    it("should return status code 409 (Conflict) if another harvester is already deployed to this location", async () => {
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

    it("should return status code 500 (Internal Error) if harvester is not deployed", async () => {
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
      expect(res.statusCode).toBe(500);
    });
  });
});
