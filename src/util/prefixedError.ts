/**
 * ### Formats error with a prefixed message
 * - If the error is an Error, it will also include the error.message
 * in the new Error.
 * - If the error is unknown, it will just throw the given message.
 *
 * **Returns an Error**, does NOT throw.
 * @param error
 * @param message
 */
export const prefixedError = (error: unknown, message: string) => {
  if (error instanceof Error) {
    return new Error(`${message}: ${error.message}`);
  } else {
    return new Error(`${message}`);
  }
};
