import { Response as SuperAgentResponse } from "superagent";
import { TRPCResponseData } from "../src/types/trpcTypes";
import { prisma } from "../src/prisma";
import config from "../src/config";
import { testUser } from "../seed/user/testUser";

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
export const getDataFromTRPCResponse = <T>(
  response: SuperAgentResponse,
): T | undefined => {
  return response.body?.result?.data as T;
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

  // we always ensure our testUser is present at a minimum
  await prisma.user.create({ data: testUser });
};

export const translateLatitude = (origLatitude: number, meters: number) => {
  const coef = meters / 111320.0;
  return origLatitude + coef;
};
