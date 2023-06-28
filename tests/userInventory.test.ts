import request from "supertest";
import { TestSingleton } from "./TestSingleton";
import { resetPrisma } from "./testHelpers";
import { Server } from "http";

describe("/userInventory", () => {
  let server: Server;
  let idToken: string;

  beforeAll(() => {
    server = TestSingleton.getInstance().server;
    idToken = TestSingleton.getInstance().idToken;
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
      const res = await request(server)
        .get("/userInventory.getUserInventory")
        .query({
          input: JSON.stringify({ userUid: null }),
        })
        .set("Authorization", `Bearer ${idToken}`);

      expect(res.statusCode).toBe(400);
    });
  });
});
