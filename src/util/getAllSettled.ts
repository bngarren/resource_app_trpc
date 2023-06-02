/**
 * Provides the result of a Promise.allSettled call on an
 * array of Promises, in a typesafe manner.
 *
 * E.g., Give the function an arr.map() that performs an asynchronous process, which then returns an array of promises, and it will process each async function concurrently, not stopping on errors/rejected promises (this is Promise.allSettled), and ultimately returning a Promise that is resolved when all the provided promises resolve or reject.
 *
 * Notably, prior to returning, it filters the PromiseFulfilledResult for only those
 * with a "fufilled" status and only returns the value (of the generic type T)
 *
 * @example
 * //* resultArray will be Model[]
 * const resultArray = await getAllSettled<Model>(missingModels.map(
 *       (m) => handleCreateModel({ modelAttribute: m }) // returns promise
 *     )
 *  );
 *
 * @author Ben Garren
 * @param arr Array of promises
 * @returns Promise that resolves to an array of results (only those that resolved/fulfilled)
 */
export const getAllSettled = async <T>(
  arr: Promise<T | null | undefined>[]
) => {
  const settled = await Promise.allSettled(arr);
  return settled
    .filter(
      (x): x is PromiseFulfilledResult<Awaited<T>> => x.status === "fulfilled"
    )
    .map((x) => x.value)
    .filter((x): x is Awaited<T> => x != null);
};
