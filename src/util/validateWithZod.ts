import { ZodSchema } from "zod";

/**
 * ### Validates data using a Zod schema and returns the typed data, or throws error
 * This helper function uses Zod schema to validate (i.e. parse) a given 'data' input and,
 * if successful, returns the data with Typescript types. Otherwise, throws an error.
 *
 * For example, this function is useful for writing/reading from the database's JSON fields
 *
 * @param schema - The Zod schema definition to use
 * @param data - The data to be validated.
 * @param context - Optional string that will be included in the error message
 * @returns If valid, returns the data with types
 */
export const validateWithZod = <T>(
  schema: ZodSchema<T>,
  data: unknown,
  context?: string,
) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Invalid ${context ? context + " " : ""}data: ${result.error}`,
    );
  }
  return result.data;
};
