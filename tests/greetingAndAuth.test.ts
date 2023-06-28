import request from "supertest";
import { extractDataFromTRPCResponse, resetPrisma } from "./testHelpers";
import { prisma } from "../src/prisma";
import { TestSingleton } from "./TestSingleton";
import { Server } from "http";
import { GreetingRequestOutput } from "../src/types/trpcTypes";

describe("Greeting/Authentication", () => {
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

  describe("/greeting", () => {
    afterEach(() => {
      // After each test, restore all mocks
      jest.restoreAllMocks();
    });

    it("should return isHealthy as true if the database connection succeeds", async () => {
      const data = await extractDataFromTRPCResponse<GreetingRequestOutput>(
        request(server).get("/greeting"),
      );
      // Check that the response data has the expected shape/value
      expect(data).toEqual({
        isHealthy: true,
      });
    });

    it("should return isHealthy as false if the database connection fails", async () => {
      // Mock the findFirst function to throw an error
      jest
        .spyOn(prisma.user, "findFirst")
        .mockRejectedValue(new Error("Database connection error"));

      const data = await extractDataFromTRPCResponse<GreetingRequestOutput>(
        request(server).get("/greeting"),
      );
      expect(data).toEqual({
        isHealthy: false,
      });
    });
  });

  describe("Authentication", () => {
    describe("with missing or invalid authentication in requests to protected endpoints", () => {
      it("should return error code 401 if lacking authorization header", async () => {
        const res = await request(server).get("/protectedGreeting");
        expect(res.statusCode).toBe(401);
      });
      it("should return error code 401 if auth token is invalid", async () => {
        await request(server)
          .get("/protectedGreeting")
          .set("Authorization", `Bearer FAKE-TOKEN`)
          .expect(401);
      });
    });

    describe("with a valid, authenticated request", () => {
      it("should NOT return error code 401", async () => {
        const res = await request(server)
          .get("/protectedGreeting")
          .set("Authorization", `Bearer ${idToken}`);

        expect(res).not.toBe(401);
      });
    });
  });
});
