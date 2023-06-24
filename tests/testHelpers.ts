import { Response as SuperAgentResponse } from "superagent";
import { TRPCResponseData } from "../src/types";

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
