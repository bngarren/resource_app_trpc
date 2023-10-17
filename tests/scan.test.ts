import request from "supertest";
import h3 from "h3-js";
import { TestSingleton } from "./TestSingleton";
import {
  AuthenticatedRequester,
  extractDataFromTRPCResponse,
  harvestRegion,
  resetPrisma,
  translateLatitude,
} from "./testHelpers";
import { Server } from "http";
import config from "../src/config";
import { prisma } from "../src/prisma";
import * as SpawnRegionService from "../src/services/spawnRegionService";
import * as ResourceService from "../src/services/resourceService";
import { scanRequestSchema } from "../src/schema";
import { ScanRequestOutput } from "../src/types/trpcTypes";
import { logger } from "../src/logger/logger";

describe("/scan", () => {
  let server: Server;
  let idToken: string;
  let requester: AuthenticatedRequester;

  beforeAll(() => {
    logger.info("Starting test suite: /scan");

    server = TestSingleton.getInstance().server;
    idToken = TestSingleton.getInstance().idToken;
    requester = new AuthenticatedRequester(server, idToken);
  });

  afterEach(async () => {
    /* For now we are calling resetPrisma() after every test...Last clocked it around ~25ms on 6/26/23.
    Could re-time it again in the future to see how this changes. If concerned that this is too much,
    can move resetPrisma() closer to each test/test suite when data absolutely needs to be refreshed.
    */
    await resetPrisma();
  });

  const latLng = h3.cellToLatLng(harvestRegion); // Longwood Park, Boston, MA

  // Setup some test data/constants for this test suite
  const latitude = latLng[0];
  const longitude = latLng[1];

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
      h3.latLngToCell(latitude, longitude, config.spawn_region_h3_resolution),
      config.scan_distance,
    );

  it("should return status code 400 (Bad Request) if missing/malformed POST body", async () => {
    const res = await requester.send("POST", "/scan", {});
    expect(res.statusCode).toBe(400);
  });

  it("should create the appropriate number of new spawn regions, if none present", async () => {
    // Since the database should be empty, we expect SpawnRegions should be created (and not reused)
    await requester.send(
      "POST",
      "/scan",
      getValidRequestBody(),
      scanRequestSchema,
    );

    // Check database for correct state
    const regions = await prisma.spawnRegion.findMany();

    expect(regions.length).toBe(getH3Group().length);
  });

  it("should not create new spawn regions if expected are already present", async () => {
    // mock this function to track when spawn regions are created
    const spy_handleCreateSpawnRegions = jest.spyOn(
      SpawnRegionService,
      "handleCreateSpawnRegions",
    );

    const first_requestBody = getValidRequestBody();
    const first_h3Index = h3.latLngToCell(
      first_requestBody.userLocation.latitude,
      first_requestBody.userLocation.longitude,
      config.spawn_region_h3_resolution,
    );
    // Since the database should be empty, we expect SpawnRegions should be created (and not reused)
    await requester.send("POST", "/scan", first_requestBody, scanRequestSchema);

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

    await requester.send(
      "POST",
      "/scan",
      second_requestBody,
      scanRequestSchema,
    );

    const secondScan_regions = await prisma.spawnRegion.findMany();

    // Now lets check our database results from calling first scan at location A and
    // second scan at a different location B (within the same h3 index)

    // We do this by checking that the list of h3Indices from the first scan is the same
    // as the list of h3Indices from the second scan
    const firstScan_h3Indices = firstScan_regions.map((r) => r.h3Index).sort();
    const secondScan_h3Indices = secondScan_regions
      .map((r) => r.h3Index)
      .sort();

    expect(firstScan_h3Indices).toEqual(secondScan_h3Indices);

    // Another way to verify that spawn region creation was only called 1 time
    expect(spy_handleCreateSpawnRegions).toHaveBeenCalledTimes(1);

    spy_handleCreateSpawnRegions.mockRestore();
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
    const response = await requester.send(
      "POST",
      "/scan",
      getValidRequestBody(),
      scanRequestSchema,
    );

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
      Promise.reject(new Error("mock - updateSpawnRegion error")),
    );

    const response = await await requester.send(
      "POST",
      "/scan",
      getValidRequestBody(),
      scanRequestSchema,
    );

    // Should send the correct status code
    expect(response.status).toBe(500);

    // Should not have updated the SpawnRegions' reset_date

    // The /scan request should have created new SpawnRegions, so we will grab them and check
    const regions = await prisma.spawnRegion.findMany();

    // Should have as many SpawnRegions in the database as the size of the h3Group (scanned area's h3 cells)
    expect(regions.length).toBe(getH3Group().length);

    // Each SpawnRegion should still have null reset_date (should not have been updated)
    regions.forEach((r) => expect(r.resetDate).toBeFalsy());

    // Should not have any spawned resources in the database if our updateSpawnRegion's all failed
    expect(prisma.spawnedResource.findMany()).resolves.toHaveLength(0);

    // Remove the spy
    spy_updateSpawnRegion.mockRestore();
  });
  // -------------------------------------------------

  // Test incorrect database state failure (un-seeded)
  // -------------------------------------------------
  it("should handle a database error (bad state/migration), i.e missing Resources and return status code 500", async () => {
    // Let's setup this test by clearing the Resources table (which should have been seeded already)
    await prisma.resource.deleteMany();

    // Create a spy on getRandomResource and mock it to throw an error
    const spy_getRandomResource = jest.spyOn(
      ResourceService,
      "getRandomResource",
    );

    spy_getRandomResource.mockImplementation(() =>
      Promise.reject(new Error("mock - getRandomResource Error")),
    );

    const response = await requester.send(
      "POST",
      "/scan",
      getValidRequestBody(),
      scanRequestSchema,
    );

    expect(response.statusCode).toBe(500);

    spy_getRandomResource.mockRestore();
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
          data: expect.any(Object),
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
      expect(interactable.distanceFromHarvestRegionCenter).toBeLessThanOrEqual(
        1000,
      );
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
