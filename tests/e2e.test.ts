import { Auth } from "firebase/auth";
import { signInTestUser } from "./../src/auth/firebaseHelpers";
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
      let clientFbAuth: Auth;
      let idToken: string;
      let userUid: string;
      beforeAll(async () => {
        const res = await signInTestUser();
        clientFbAuth = res.clientFbAuth;
        idToken = res.idToken;
        userUid = res.userUid;
      });

      afterAll(async () => {
        await clientFbAuth.signOut();
      });

      it("should NOT return error code 401", async () => {
        const res = await request(server)
          .get("/protectedGreeting")
          .set("Authorization", `Bearer ${idToken}`);

        expect(res).not.toBe(401);
      });
    });
  });
});
