import { Auth } from "firebase/auth";
import { signInTestUser } from "./../src/auth/firebaseHelpers";
import request from "supertest";
import { Server } from "http";
import app from "../src/main";
import {
  extractDataFromTRPCResponse,
  resetPrisma,
  translateLatitude,
} from "./testHelpers";
import { prisma } from "../src/prisma";
import * as h3 from "h3-js";
import { scanRequestSchema } from "../src/schema";
import { ScanRequestOutput } from "../src/types/trpcTypes";
import * as SpawnRegionService from "../src/services/spawnRegionService";
import config from "../src/config";

describe("Testing the Express/TRPC server", () => {
  let server: Server;

  beforeAll(() => {
    server = app.listen();
  });

  afterAll((done) => {
    server.close(done);
  });

  afterEach(async () => {
    /* For now we are calling resetPrisma() after every test...Last clocked it around ~25ms on 6/26/23.
    Could re-time it again in the future to see how this changes. If concerned that this is too much,
    can move resetPrisma() closer to each test/test suite when data absolutely needs to be refreshed.
    */
    await resetPrisma();
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
      /*
        The following setup allows us to use an authenticated test user.

        This code is replicated again other test suites.
        ! Any changes need to be changed everywhere
      */
      // -------------------------------------------------
      let clientFbAuth: Auth;
      let idToken: string;
      beforeAll(async () => {
        const res = await signInTestUser();
        clientFbAuth = res.clientFbAuth;
        idToken = res.idToken;
      });

      afterAll(async () => {
        await clientFbAuth.signOut();
      });
      // -------------------------------------------------

      it("should NOT return error code 401", async () => {
        const res = await request(server)
          .get("/protectedGreeting")
          .set("Authorization", `Bearer ${idToken}`);

        expect(res).not.toBe(401);
      });
    });
  });

  describe("Game Routes", () => {
    // Since all game routes (e.g. /scan) are protected routes, i.e. require an authenticated user,
    // we setup our logged in test user first
    let clientFbAuth: Auth;
    let idToken: string;
    beforeAll(async () => {
      const res = await signInTestUser();
      clientFbAuth = res.clientFbAuth;
      idToken = res.idToken;
    });

    afterAll(async () => {
      await clientFbAuth.signOut();
    });

    describe("POST /scan", () => {
      beforeAll(() => {
        // Mock our config variables
        jest.mock("../src/config", () => ({
          ...jest.requireActual("../src/config"),
          spawn_region_h3_resolution: 9,
          scan_distance: 1,
        }));
      });

      afterAll(() => {
        jest.resetModules();
      });

      // Setup some test data/constants for this test suite
      const latitude = 42.339754; // Longwood Park, Boston, MA
      const longitude = -71.115306;

      const getValidRequestBody = (
        _latitude = latitude,
        _longitude = longitude,
      ) => {
        return {
          userLocation: {
            latitude: _latitude,
            longitude: _longitude,
          },
        };
      };

      // The h3 indices for spawn regions
      const getH3Group = () =>
        h3.gridDisk(
          h3.latLngToCell(
            latitude,
            longitude,
            config.spawn_region_h3_resolution,
          ),
          config.scan_distance,
        );

      it("should return status code 400 (Bad Request) if missing/malformed POST body", async () => {
        const result = await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send({});
        expect(result.statusCode).toBe(400);
      });

      it("should create the appropriate number of new spawn regions, if none present", async () => {
        // Since the database should be empty, we expect SpawnRegions should be created (and not reused)
        await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send(getValidRequestBody());

        // Check database for correct state
        const regions = await prisma.spawnRegion.findMany();

        expect(regions.length).toBe(getH3Group().length);
      });

      it("should not create new spawn regions if expected are already present", async () => {
        const first_requestBody = getValidRequestBody();
        const first_h3Index = h3.latLngToCell(
          first_requestBody.userLocation.latitude,
          first_requestBody.userLocation.longitude,
          config.spawn_region_h3_resolution,
        );
        // Since the database should be empty, we expect SpawnRegions should be created (and not reused)
        await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send(first_requestBody);

        const firstScan_regions = await prisma.spawnRegion.findMany();

        // move the original latitude 5 meters. Should be in the same h3 cell
        const newLatitude = translateLatitude(latitude, 5);

        const second_requestBody = getValidRequestBody(newLatitude);
        const second_h3Index = h3.latLngToCell(
          second_requestBody.userLocation.latitude,
          second_requestBody.userLocation.longitude,
          config.spawn_region_h3_resolution,
        );

        // Should be performing /scan on 2 different locations
        expect(first_requestBody.userLocation).not.toEqual(
          second_requestBody.userLocation,
        );

        // Both locations should be within the same h3 cell though
        expect(first_h3Index).toBe(second_h3Index);

        await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send(second_requestBody);

        const secondScan_regions = await prisma.spawnRegion.findMany();

        // Now lets check our database results from calling first scan at location A and
        // second scan at a different location B (within the same h3 index)

        // We do this by checking that the list of h3Indices from the first scan is the same
        // as the list of h3Indices from the second scan
        const firstScan_h3Indices = firstScan_regions
          .map((r) => r.h3Index)
          .sort();
        const secondScan_h3Indices = secondScan_regions
          .map((r) => r.h3Index)
          .sort();

        expect(firstScan_h3Indices).toEqual(secondScan_h3Indices);
      });

      // Test create SpawnRegions failure
      // -------------------------------------------------
      it("should handle handleCreateSpawnRegions failure", async () => {
        // Create a spy on handleCreateSpawnRegions and mock it to throw an error
        const spy_handleCreateSpawnRegions = jest.spyOn(
          SpawnRegionService,
          "handleCreateSpawnRegions",
        );

        spy_handleCreateSpawnRegions.mockImplementation(() =>
          Promise.reject(new Error("create error")),
        );

        // Since the database should be empty, we expect SpawnRegions should be created (and not reused)
        const response = await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send(getValidRequestBody());

        // Should send the correct status code
        expect(response.status).toBe(500);

        // Should not have any SpawnRegions in the database

        expect(prisma.spawnRegion.findFirst()).resolves.toBeNull();

        // Remove the spy
        spy_handleCreateSpawnRegions.mockRestore();
      });
      // -------------------------------------------------

      // Test updateSpawnRegion failure
      // -------------------------------------------------
      it("should handle updateSpawnRegion failure", async () => {
        // Create a spy on updateSpawnRegion and mock it to throw an error
        const spy_updateSpawnRegion = jest.spyOn(
          SpawnRegionService,
          "updateSpawnRegion",
        );

        spy_updateSpawnRegion.mockImplementation(() =>
          Promise.reject(new Error("update error")),
        );

        const response = await request(server)
          .post("/scan")
          .set("Authorization", `Bearer ${idToken}`)
          .send(getValidRequestBody());

        // Should send the correct status code
        expect(response.status).toBe(500);

        // Should not have updated the SpawnRegions' reset_date

        // The /scan request should have created new SpawnRegions, so we will grab them and check
        const regions = await prisma.spawnRegion.findMany();

        // Should have as many SpawnRegions in the database as the size of the h3Group (scanned area's h3 cells)
        expect(regions.length).toBe(getH3Group().length);

        // Each SpawnRegion should still have null reset_date (should not have been updated)
        regions.forEach((r) => expect(r.resetDate).toBeFalsy());

        // Should not have any resources in the database if our updateSpawnRegion's all failed
        expect(prisma.spawnedResource.findMany()).resolves.toHaveLength(0);

        // Remove the spy
        spy_updateSpawnRegion.mockRestore();
      });
      // -------------------------------------------------

      it("should give a correct ScanResult", async () => {
        // Verify that scan request input is valid
        // -------------------------------------------------
        const requestBody = getValidRequestBody();

        const { success: isValidRequest } =
          scanRequestSchema.safeParse(requestBody);
        expect(isValidRequest).toBe(true);
        // -------------------------------------------------

        // Send a /scan request and get scanOutput (i.e. ScanResult)
        // -------------------------------------------------
        const scanOutput = await extractDataFromTRPCResponse<ScanRequestOutput>(
          request(server)
            .post("/scan")
            .set("Authorization", `Bearer ${idToken}`)
            .send(requestBody),
        );

        // Confirm that our scanOutput is what we expect to send to our client
        /* Note, our test here is somewhat the source of truth. If the API response doesn't match our test
        expectations, then our API is wrong (or we have changed our intended API response without updating the test)
        
        Although there is some compile-time type safety at the level of our API router, we are a little redundant here,
        in this test, to ensure that the runtime result sent back to the client is exactly what we intend.
        */
        // ------------------------------------------------

        // Check shape and some key properties
        expect(scanOutput).toMatchObject({
          metadata: expect.objectContaining({
            scannedLocation: expect.arrayContaining([
              requestBody.userLocation.latitude,
              requestBody.userLocation.longitude,
            ]),
            // timestamp: expect.any(String), // TODO ignore for now
          }),
          scanPolygons: expect.objectContaining({
            centerPolygon: expect.any(Array),
            peripheralPolygons: expect.any(Array),
          }),
          neighboringPolygons: expect.any(Array),
          interactables: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              type: expect.any(String),
              location: expect.any(Array),
              distanceFromHarvestRegionCenter: expect.any(Number),
              userCanInteract: expect.any(Boolean),
            }),
          ]),
          sortedCanInteractableIds: expect.any(Array),
        });

        // Check the correctness of our interactables
        scanOutput.interactables.forEach((interactable) => {
          // Expect each interactable object to have location as array of two numbers
          expect(interactable.location.length).toBe(2);
          interactable.location.forEach((coordinate: unknown) => {
            expect(typeof coordinate).toBe("number");
          });
          // Expect distanceFromHarvestRegionCenter to be within a reasonable range
          expect(
            interactable.distanceFromHarvestRegionCenter,
          ).toBeGreaterThanOrEqual(0);
          expect(
            interactable.distanceFromHarvestRegionCenter,
          ).toBeLessThanOrEqual(1000);
        });

        // Check that sortedCanInteractableIds is made of up interactable ids
        // Extract all interactable ids into a new array
        const interactableIds = scanOutput.interactables.map(
          (interactable) => interactable.id,
        );

        // Then check if every id in sortedCanInteractableIds is present in interactableIds
        scanOutput.sortedCanInteractableIds.forEach((id) => {
          expect(interactableIds).toContain(id);
        });
      });
    });
  });
});
