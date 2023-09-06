import { TestSingleton } from "./TestSingleton";
import { authenticatedRequest, resetPrisma } from "./testHelpers";
import { Server } from "http";
import { logger } from "../src/logger/logger";
import { prisma } from "../src/prisma";

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
