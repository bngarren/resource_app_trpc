/**
 * ### Re-throws the error with a prefixed message
 * - If the error is an Error, it will also include the error.message
 * in the new Error.
 * - If the error is unknown, it will just throw the given message.
 * @param error
 * @param message
 */
export const rethrowWith = (error: unknown, message: string) => {
  if (error instanceof Error) {
    throw new Error(`${message}: ${error.message}`);
  } else {
    throw new Error(`${message}`);
  }
};
