/**
 * ### Formats error with a prefixed message
 * - If the error is an Error, it will also include the error.message
 * in the new Error.
 * - If the error is unknown, it will just throw the given message.
 *
 * **Returns an Error**, does NOT throw.
 * @param error
 * @param prefix
 */
export const prefixedError = (error: unknown, _prefix: string) => {
  let newError: Error;

  const prefix = _prefix.length !== 0 ? `${_prefix}: ` : "";

  if (error instanceof Error) {
    newError = new Error(`${prefix}${error.message}`);
    newError.stack = error.stack;
  } else {
    newError = new Error(`${prefix}`);
  }

  return newError;
};
