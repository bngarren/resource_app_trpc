import {
  addResourceToUserInventory,
  getUserInventoryItems,
  removeUserInventoryItemByItemId,
} from "./../src/services/userInventoryService";
import { TestSingleton } from "./TestSingleton";
import {
  AuthenticatedRequester,
  getDataFromTRPCResponse,
  getTestFilename,
  resetPrisma,
  throwIfBadStatus,
} from "./testHelpers";
import { Server } from "http";
import { logger } from "../src/main";
import { getUserInventoryRequestSchema } from "../src/schema";
import { GetUserInventoryRequestOutput } from "../src/types/trpcTypes";
import { prisma } from "../src/prisma";
import {
  UserInventoryItemWithAnyItem,
  UserInventoryItemWithItem,
} from "../src/types";
import { parseISO } from "date-fns";
import { User } from "@prisma/client";

describe("/userInventory", () => {
  let server: Server;
  let idToken: string;
  let userUid: string;
  let requester: AuthenticatedRequester;

  beforeAll(() => {
    logger.info(
      `Starting test suite located at: ${getTestFilename(__filename)}`,
    );
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

  describe("/userInventory.getUserInventory", () => {
    let testUser: User;

    beforeEach(async () => {
      testUser = await prisma.user.findUniqueOrThrow({
        where: {
          firebase_uid: userUid,
        },
      });
    });

    it("should return status code 400 (Bad Request) if missing user uid", async () => {
      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: null },
      );

      expect(res.statusCode).toBe(400);
    });
    it("should return status code 404 (Not Found) if the given user uid is not located in the database", async () => {
      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: "some-fake-uid" },
        getUserInventoryRequestSchema,
      );
      expect(res.statusCode).toBe(404);
    });

    it("should return status code 200 (OK) if given user uid is found in the database", async () => {
      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: userUid },
        getUserInventoryRequestSchema,
      );
      expect(res.statusCode).toBe(200);
    });

    it("should return a correct Player Inventory", async () => {
      const userResourceItems =
        (await prisma.resourceUserInventoryItem.findMany({
          where: {
            userId: testUser.id,
          },
          include: {
            item: true,
          },
        })) as UserInventoryItemWithItem<"RESOURCE">[];

      const userHarvesterItems =
        (await prisma.harvesterUserInventoryItem.findMany({
          where: {
            userId: testUser.id,
          },
          include: {
            item: true,
          },
        })) as UserInventoryItemWithItem<"HARVESTER">[];
      // ...
      // TODO: include userComponentItems when necessary...

      const allItems: UserInventoryItemWithAnyItem[] = [
        ...userResourceItems,
        ...userHarvesterItems,
      ];

      const allItemIds = allItems.map((i) => i.id);

      const totalInventorySize = allItems.length;

      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: userUid },
        getUserInventoryRequestSchema,
      );
      throwIfBadStatus(res);

      const playerInventory =
        getDataFromTRPCResponse<GetUserInventoryRequestOutput>(res);

      // Expect that the player inventory returned from the req has the
      // same number of items as when we queried directly
      expect(playerInventory.items).toHaveLength(totalInventorySize);

      // Expect that all inventory item id's are present
      const allIdsPresent = allItemIds.every((inventoryItemId) => {
        return playerInventory.items.some((i) => i.id === inventoryItemId);
      });

      expect(allIdsPresent).toBe(true);

      // Validate the Player Inventory result

      // Validate top-level properties
      expect(playerInventory).toHaveProperty("timestamp");
      expect(typeof playerInventory.timestamp).toBe("string");
      expect(parseISO(playerInventory.timestamp)).toBeInstanceOf(Date);
      expect(playerInventory).toHaveProperty("items");
      expect(Array.isArray(playerInventory.items)).toBe(true);

      // Validate items array shape
      playerInventory.items.forEach((item) => {
        // Validate properties for each item
        expect(item).toHaveProperty("id");
        expect(typeof item.id).toBe("string");

        expect(item).toHaveProperty("name");
        expect(typeof item.name).toBe("string");

        expect(item).toHaveProperty("type");

        expect(item).toHaveProperty("quantity");
        expect(typeof item.quantity).toBe("number");
      });
    });

    it("should return an object with an empty items array if the user has no inventory items", async () => {
      const userInventoryItemsDict = await getUserInventoryItems(testUser.id);

      const userInventoryItems = Object.values(userInventoryItemsDict).flat();

      try {
        // Loop through each inventory item and delete it
        await Promise.all(
          userInventoryItems.map((inventoryItem) => {
            return removeUserInventoryItemByItemId(
              inventoryItem.item.id,
              inventoryItem.itemType,
              testUser.id,
            );
          }),
        );
      } catch (err) {
        logger.error(
          err,
          "Unexpected error when removing user inventory items",
        );
      }

      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: userUid },
        getUserInventoryRequestSchema,
      );
      throwIfBadStatus(res);

      const playerInventory =
        getDataFromTRPCResponse<GetUserInventoryRequestOutput>(res);

      expect(playerInventory.items).toHaveLength(0);
    });

    it("should not return another user's inventory items", async () => {
      // ! If the test fails, check the base seed
      // We need to add another user and userInventoryItem (apart from the base testUser and items)

      const anotherUser = await prisma.user.create({
        data: {
          email: "anotherUser@gmail.com",
          firebase_uid: "another-uid",
        },
      });
      // Grab a resource
      const resource = await prisma.resource.findFirstOrThrow();

      const anotherUserInventoryItem = await addResourceToUserInventory({
        resourceId: resource.id,
        userId: anotherUser.id,
        quantity: 1,
        itemType: "RESOURCE",
      });

      const res = await requester.send(
        "GET",
        "/userInventory.getUserInventory",
        { userUid: userUid },
        getUserInventoryRequestSchema,
      );

      const playerInventory =
        getDataFromTRPCResponse<GetUserInventoryRequestOutput>(res);

      // Expect that our returned player inventory does not contain the other user's inventory item
      expect(playerInventory.items).not.toBe(
        expect.arrayContaining(
          expect.objectContaining(anotherUserInventoryItem) as any[],
        ),
      );
    });
  });
});
