import request from "supertest";
import { Server } from "http";
import app from "../src/main";
import { extractDataFromTRPCResponse } from "./testHelpers";
import { prisma } from "../src/prisma";

describe("Testing the Express/TRPC server", () => {
  let server: Server;

  beforeAll(() => {
    server = app.listen();
  });

  afterAll((done) => {
    server.close(done);
  });

  describe("GET /greeting", () => {
    type getGreetingResponse = {
      isHealthy: boolean;
    };

    afterEach(() => {
      // After each test, restore all mocks
      jest.restoreAllMocks();
    });

    it("should return isHealthy as true if the database connection succeeds", async () => {
      const data = await extractDataFromTRPCResponse<getGreetingResponse>(
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

      const data = await extractDataFromTRPCResponse<getGreetingResponse>(
        request(server).get("/greeting"),
      );
      expect(data).toEqual({
        isHealthy: false,
      });
    });
  });
});
