import { ItemType } from "@prisma/client";
import { TestSingleton } from "./TestSingleton";
import {
  authenticatedRequest,
  getDataFromTRPCResponse,
  resetPrisma,
} from "./testHelpers";
import { Server } from "http";
import { prisma } from "../src/prisma";
import { addResourceToUserInventory } from "../src/services/userInventoryService";
import { GetUserInventoryRequestOutput } from "../src/types/trpcTypes";
import { PlayerInventory } from "../src/types";
import { logger } from "../src/logger/logger";

describe("/userInventory", () => {
  let server: Server;
  let idToken: string;
  let userUid: string;

  beforeAll(() => {
    logger.info("Starting test suite: /scan");
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

  describe("/getUserInventory", () => {
    it("should return status code 400 (Bad Request) if missing user uid", async () => {
      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: null },
      );

      expect(res.statusCode).toBe(400);
    });
    it("should return status code 404 (Not Found) if the given user uid is not located in the database", async () => {
      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: "some-fake-uid" },
      );
      expect(res.statusCode).toBe(404);
    });

    it("should return status code 200 (OK) if given user uid is found in the database", async () => {
      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: userUid },
      );
      expect(res.statusCode).toBe(200);
    });

    it("should return an object with an empty items array if the user has no inventory items", async () => {
      // The base seed should include 1 item (Resource, gold) for testUser
      // Let's clear the user's inventory items...
      const user = await prisma.user.findUniqueOrThrow({
        where: {
          firebase_uid: userUid,
        },
      });
      await prisma.userInventoryItem.deleteMany({
        where: {
          userId: user.id,
        },
      });

      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: userUid },
      );

      const data = getDataFromTRPCResponse<PlayerInventory>(res);

      expect(data).toBeInstanceOf(Object);
      expect(data.items).toHaveLength(0);
    });

    it("should return the all of the user's inventory items", async () => {
      // The base seed should include 1 item (Resource, gold) for testUser
      // ! If the test fails, check the base seed
      const user = await prisma.user.findUniqueOrThrow({
        where: {
          firebase_uid: userUid,
        },
      });
      const actualUserInventoryItems = await prisma.userInventoryItem.findMany({
        where: {
          userId: user.id,
        },
      });

      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: userUid },
      );

      const data = getDataFromTRPCResponse<PlayerInventory>(res);

      expect(data.items).toHaveLength(1);

      const actualUserInventoryItemIds = actualUserInventoryItems.map(
        (i) => i.id,
      );
      const returnedItemIds = data.items.map((i) => i.id);

      // The item id's in the returned PlayerInventory should equal the query result's id's from UserInventoryItems[]
      expect(returnedItemIds).toEqual(
        expect.arrayContaining(actualUserInventoryItemIds),
      );
    });

    it("should not return another user's inventory items", async () => {
      // The base seed should include 1 item (Resource, gold) for testUser
      // We need to add another user and userInventoryItem

      const anotherUser = await prisma.user.create({
        data: {
          email: "anotherUser@gmail.com",
          firebase_uid: "another-uid",
        },
      });
      // Grab a resource
      const resource = await prisma.resource.findFirstOrThrow();

      const anotherUserInventoryItem = await addResourceToUserInventory(
        resource.id,
        anotherUser.id,
        1,
      );

      // Ensure there are now 2 userinventoryitems
      expect(prisma.userInventoryItem.findMany()).resolves.toHaveLength(2);

      const user = await prisma.user.findUniqueOrThrow({
        where: {
          firebase_uid: userUid,
        },
      });

      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: userUid },
      );

      const data = getDataFromTRPCResponse<PlayerInventory>(res);

      // Expect that our returned player inventory does not contain the other user's inventory item
      expect(data.items).not.toBe(
        expect.arrayContaining(
          expect.objectContaining(anotherUserInventoryItem),
        ),
      );

      // The returned inventory item (wihtin PlayerInventory response)
      const returnedInventoryItem = data.items[0];

      // Expect that the UserInventoryItem associated with our test user (should only be one in the base seed) is the same
      // item that was returned as the InventoryItem in PlayerInventory
      expect(
        prisma.userInventoryItem.findFirst({
          where: {
            userId: user.id,
          },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          id: returnedInventoryItem.id,
        }),
      );
    });

    it("should return a correct PlayerInventory", async () => {
      const res = await authenticatedRequest(
        server,
        "GET",
        "/userInventory.getUserInventory",
        idToken,
        { userUid: userUid },
      );

      const data = getDataFromTRPCResponse<GetUserInventoryRequestOutput>(res);

      // Confirm that our GetUserInventoryRequestOutput is what we expect to send
      // to our client, i.e. PlayerInventory type
      expect(data).toMatchObject({
        timestamp: expect.any(String),
        items: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            type: expect.any(String),
            quantity: expect.any(Number),
            metadata: expect.any(Object),
          }),
        ]),
      });

      // Additional check for type field to match our ItemType typescript type
      data.items.forEach((item) => {
        expect(Object.values(ItemType)).toContain(item.type);
      });
    });
  });
});
