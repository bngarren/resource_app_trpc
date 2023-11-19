import { pdate } from "./../src/util/getPrettyDate";
import { Response as SuperAgentResponse } from "superagent";
import { ScanRequestOutput, TRPCResponseData } from "../src/types/trpcTypes";
import { prisma } from "../src/prisma";
import config from "../src/config";
import { Server } from "http";
import request, { Response, Test } from "supertest";
import { setupBaseSeed } from "../seed/setupBaseSeed";
import * as h3 from "h3-js";
import * as ScanService from "../src/services/scanService";
import * as QueryResource from "../src/queries/queryResource";
import { Coordinate } from "../src/types";
import { Prisma } from "@prisma/client";
import { logger } from "../src/main";
import path from "path";
import { prefixedError } from "../src/util/prefixedError";

export const TEST_USER = Object.freeze({
  email: "testUser@gmail.com",
  firebase_uid: "aNYKOoPl8qeczPnZeNeuFiffxLf1",
});

export const getTestFilename = (filename: string) => {
  const fullPath = path.resolve(filename);
  const fileNameFull = fullPath.split("tests/")[1];
  return fileNameFull; // .split(".test")[0]; to remove the file extensions
};

/**
 * ### Helper function to extract data from a TRPC response
 * 
 * @template T the expected type of the data in the TRPC response
 * @param requestPromise a Promise that resolves to a SuperAgentResponse, typically from calling request(app).get('/my-endpoint')
 * @return a Promise that resolves to the data in the TRPC response
 * ---
 * #### Example
 * ```
 * const data = await extractDataFromTRPCResponse<{ isHealthy: boolean }>(
 * request(app).get('/my-endpoint')
   );
 * ```
   This tells TypeScript that the data property in the response body is expected
   to be an object with a isHealthy property of type boolean. The helper function
   then returns this data object, and TypeScript will enforce that it matches the
   expected shape.
 */
export async function extractDataFromTRPCResponse<T>(
  requestPromise: Promise<SuperAgentResponse>,
): Promise<T> {
  // Sends the test request and waits for the response
  const response: SuperAgentResponse = await requestPromise;
  // Extract the body of the response and store it in a variable named body.
  // The body of the response is expected to have a specific shape,
  // as defined by the TRPCResponseData<T> interface
  const body: TRPCResponseData<T> = response.body;
  return body.result.data;
}

/**
 * This helper simply reaches into the response object and returns the data located
 * at `response.body.result.data`. This is where TRPC puts the response payload.
 */
export const getDataFromTRPCResponse = <T>(response: SuperAgentResponse): T => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!response.body.result.data) {
    throw new Error("no data in response");
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return response.body?.result?.data as T;
};

export const throwIfBadStatus = (response: Response) => {
  if (!response.ok) {
    throw prefixedError(response.error, "Bad status in response");
  }
};

/**
 * ### Wraps a typical supertest Test with authentication header and input for GET and POST requests
 * If a typical request with supertest looks like the following:
 * ```javascript
 * const res = await request(server)
          .get("/endpoint")
          .set("Authorization", `Bearer ${idToken}`)
          .query({
            input: JSON.stringify({key: value})
          })
 * ```
 * One can see the boilerplate needed to send an authorization header as well as the unique way that TRPC
 * expects any values passed as query parameters. 
 * 
 * This function wraps this into:
 * ```javascript
 * const res = await authenticatedRequest(
        server,
        "GET",
        "/endpoint",
        idToken,
        { key: value },
      );
 * ```
 * 
 * @param api The API/app that supertest expects as a parameter
 * @param type GET or POST
 * @param endpoint The TRPC procedure
 * @param idToken The authenticated user idToken (i.e. Firebase)
 * @param input Input object that will be passed as query param (GET) or JSON body (POST)
 * @param _withSchema Zod schema used for this endpoint to allow the 'input' param to be type checked (compile time)
 */
export const authenticatedRequest = async <T extends Zod.ZodType<unknown>>(
  api: Server,
  type: "GET" | "POST",
  endpoint: string,
  idToken: string,
  input?: Zod.infer<T>,
  _withSchema?: T,
) => {
  let req: Test;
  switch (type) {
    case "GET":
      req = request(api)
        .get(endpoint)
        .set("Authorization", `Bearer ${idToken}`);
      if (input) {
        try {
          return req.query({
            input: JSON.stringify(input),
          });
        } catch (error) {
          throw prefixedError(
            error,
            `Could not stringify input of request: ${req.method} ${req.url}`,
          );
        }
      } else {
        return req;
      }
    case "POST":
      req = request(api)
        .post(endpoint)
        .set("Authorization", `Bearer ${idToken}`);
      if (input) {
        try {
          return req.send(input);
        } catch (error) {
          throw prefixedError(
            error,
            `Couldn't attach body of POST request: ${req.method} ${req.url}`,
          );
        }
      } else {
        return req;
      }
  }
};

/**
 * An AuthenticatedRequester instance is used to send authenticated requests to a specific
 * server (API) with an 'idToken' for Bearer authorization.
 */
export class AuthenticatedRequester {
  constructor(
    private readonly server: Server,
    private readonly idToken: string,
  ) {}

  async send<T extends Zod.ZodType<unknown>>(
    method: "POST" | "GET",
    endpoint: string,
    input?: Zod.infer<T>,
    withSchema?: T,
  ) {
    return authenticatedRequest(
      this.server,
      method,
      endpoint,
      this.idToken,
      input,
      withSchema,
    );
  }
}

/**
 * The scan/harvest region (h3Index) used for testing.
 *
 * The mockScan() helper function is based on scanning at this location. E.g., a test that
 * begins with mockScan() can then expect consistent results with regard to the spawned
 * resources.
 */
export const harvestRegion = "8a2a30640907fff"; // Longwood Park, Boston at h3 resolution 10

/**
 * ### Performs a \scan request with some mocked logic to ensure consistent result
 * - The scan will occur at a **consistent location** (Longwood Park, Boston) which is
 * represented by the scanRegion h3 index.
 * - This will use a scanDistance=1 to generate 7 SpawnRegions
 * - It will generate exactly **x amount of spawned resources** (0 to 3) within the central most spawn region (892a3064093ffff)
 * that will always have the same location (same h3 index, resolution 11)
 * - All 3 spawned resources are within 250 meters
 *
 * ! Note, that if the h3 resolutions for scan, spawn region, resources are changed, we must
 * ! modify the code accordingly!
 *
 * @param numberOfSpawnedResources - How many of the pre-made resources to spawn (min 0, max 3)
 * @param server
 * @param idToken
 * @returns
 */
export const mockScan = async (
  numberOfSpawnedResources: number,
  server: Server,
  idToken: string,
): Promise<ScanRequestOutput> => {
  if (numberOfSpawnedResources < 0 || numberOfSpawnedResources > 3) {
    throw new Error(
      `Number of spawned resources (${numberOfSpawnedResources}) is out of range (0 to 3)`,
    );
  }

  const scanRegion = harvestRegion; // Longwood Park, Boston at h3 resolution 10
  const latLng = h3.cellToLatLng(scanRegion);
  const scanLocation: Coordinate = {
    latitude: latLng[0],
    longitude: latLng[1],
  };

  /*
  Scanning at the above scanRegion (resolution 10) at Longwood Park at a scanDistance=1
  will produce 7 SpawnRegions (resolution 9) including the central spawn region (892a3064093ffff)

  The pre-identified resolution 11 cells near scanRegion (within central spawn region):
  1. 8b2a30640931fff (Basketball court)
  2. 8b2a30640923fff (Baseball/Water)
  3. 8b2a3064092bfff (Lawrence crossing)

  These are all within 250 meters of the scanRegion center.

  */

  // Mock the handleScan to force a scanDistance=1
  // We save the original function first so we can call it from within the mock implementation
  const orig_handleScan = ScanService.handleScan;
  const spy_handleScan = jest
    .spyOn(ScanService, "handleScan")
    .mockImplementationOnce(async (fromLocation: Coordinate) => {
      return orig_handleScan(fromLocation, 1);
    });

  // These are the SpawnedResources we will force to spawn at specific locations
  // within the chosen SpawnRegion
  const forcedSpawnedResourceModels: Prisma.SpawnedResourceCreateInput[] = [
    {
      h3Index: "8b2a30640931fff",
      h3Resolution: 11,
      resource: {
        connect: {
          url: "gold",
        },
      },
      spawnRegion: {
        connect: {
          h3Index: "892a3064093ffff",
        },
      },
    },
    {
      h3Index: "8b2a30640923fff",
      h3Resolution: 11,
      resource: {
        connect: {
          url: "arcane_quanta",
        },
      },
      spawnRegion: {
        connect: {
          h3Index: "892a3064093ffff",
        },
      },
    },
    {
      h3Index: "8b2a3064092bfff",
      h3Resolution: 11,
      resource: {
        connect: {
          url: "spectrite",
        },
      },
      spawnRegion: {
        connect: {
          h3Index: "892a3064093ffff",
        },
      },
    },
  ];

  // Mock the spawned resource generation for specific spawn region
  const orig_prisma_updateSpawnedResourcesForSpawnRegionTransaction =
    QueryResource.prisma_updateSpawnedResourcesForSpawnRegionTransaction;

  const spy_prisma_updateSpawnedResourcesForSpawnRegionTransaction = jest
    .spyOn(
      QueryResource,
      "prisma_updateSpawnedResourcesForSpawnRegionTransaction",
    )
    .mockImplementation(async (spawnRegionId: string) => {
      // We are only interested in 1 spawn region, locate it.
      const centralSpawnRegion = await prisma.spawnRegion.findUniqueOrThrow({
        where: {
          h3Index: "892a3064093ffff",
        },
      });

      // We use the special `forcedSpawnedResourceModels` parameter
      // If it's the Spawn region of interest, pass the models, if not just [] so that
      // all other spawn regions do not spawn any resources (better for testing)
      return await orig_prisma_updateSpawnedResourcesForSpawnRegionTransaction(
        spawnRegionId,
        spawnRegionId === centralSpawnRegion.id
          ? forcedSpawnedResourceModels.slice(0, numberOfSpawnedResources) // if 0, get []. if 1, get first element, etc.
          : [],
      );
    });

  logger.debug(
    { harvestRegion, scanLocation, numberOfSpawnedResources },
    `Performing mockScan`,
  );

  // Perform the scan request
  const s = await authenticatedRequest(server, "POST", "/scan", idToken, {
    userLocation: scanLocation,
  });
  throwIfBadStatus(s);

  // Revert the mocks
  spy_handleScan.mockRestore();
  spy_prisma_updateSpawnedResourcesForSpawnRegionTransaction.mockRestore();

  return getDataFromTRPCResponse<ScanRequestOutput>(s);
};

/**
 * ### Performs a /scan then /harvester.deploy to setup environment for further testing
 * - **DEFAULTS to a mockScan() if no h3Index param is provided**
 * - Requires the server (API) and idToken (authenticated user) in order to make
 * these authenticated requests
 * - Will throw error if a bad status returns from either request
 * @param harvesterId
 * @param server
 * @param idToken
 * @param h3Index - Optional. Should be the correct h3 resolution for a scanRegion/harvestRegion. If not provided, a mockScan() is used by default.
 */
export const scanAndDeployHarvester = async (
  harvesterId: string,
  server: Server,
  idToken: string,
  h3Index?: string,
) => {
  if (!h3Index) {
    await mockScan(3, server, idToken);
  } else {
    const latLng = h3.cellToLatLng(h3Index);
    const scanRequest = {
      userLocation: {
        latitude: latLng[0],
        longitude: latLng[1],
      },
    };
    const res1 = await authenticatedRequest(
      server,
      "POST",
      "/scan",
      idToken,
      scanRequest,
    );
    throwIfBadStatus(res1);
  }

  // Now deploy the testHarvester to the same location we just scanned
  const res2 = await authenticatedRequest(
    server,
    "POST",
    "/harvester.deploy",
    idToken,
    {
      harvesterId: harvesterId,
      harvestRegion: h3Index ?? harvestRegion,
    },
  );
  throwIfBadStatus(res2);
};

/**
 * ### Reset the Postgres database via Prisma
 * #### FOR TEST ENVIRONMENT ONLY
 * - This function is intended to delete all rows from all tables.
 * - It also seeds the database with data.
 * - Would typically call this function at the beginning or end of each test (or test suite)
 *
 * ---
 *
 * #### Details
 * This function uses a raw SQL query to truncate all tables:
 * ```sql
 * TRUNCATE TABLE ${tables} CASCADE;
 * ```
 */
export const resetPrisma = async () => {
  if (config.node_env === "production") {
    throw new Error(
      "Attempting to TRUNCATE all database tables. You probably don't want to do this on production. Cancelling...",
    );
  }

  // - - - - - - - - - FIRST, truncate all tables - - - - - - - -

  // pg_tables is a system catalog view that holds information about user-defined tables in the PostgreSQL database
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  // filters out the _prisma_migrations table, which is used by Prisma to keep track of database migrations.
  // You typically don't want to truncate this table
  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== "_prisma_migrations")
    .map((name) => `"public"."${name}"`)
    .join(", ");

  // The CASCADE option ensures that the truncation cascades to any dependent tables (e.g., due to foreign key constraints)
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);

  // - - - - - - - - - NEXT, re-seed our test data - - - - - - - -

  await setupBaseSeed(prisma);
};

/**
 * ### Utility function for moving a given latitude by a specified distance, in meters
 * Useful for testing nearby but different locations
 */
export const translateLatitude = (origLatitude: number, meters: number) => {
  const coef = meters / 111320.0;
  return origLatitude + coef;
};

export type QueryLog = {
  query: string;
  params: string;
  timestamp: Date;
};

/**
 * ### Accepts log data (from Prisma) and transforms into a prettier object
 * 
 * #### Example
 * ```javascript
 * const queries: any[] = [];
      prisma.$on("query", (e) => {
        queries.push({
          "#": queries.length + 1,
          ...transformQueryLog({
            query: e.query,
            params: e.params,
            timestamp: e.timestamp,
          }),
        });
      });
 * ```
 * @param log
 * @returns
 */
export const transformQueryLog = (log: QueryLog) => {
  // Remove all instances of "public".
  let transformedQuery = log.query.replace(/"public"\./g, "");

  // Parse the params string to get an array of parameters.
  const params: string[] = JSON.parse(log.params);

  // Replace each placeholder variable with the corresponding parameter.
  params.forEach((param: string, index: number) => {
    const placeholder = `$${index + 1}`;
    transformedQuery = transformedQuery.replace(placeholder, `'${param}'`);
  });

  return {
    query: transformedQuery,
    timestamp: pdate(log.timestamp, true),
  };
};
