/**
 * Randomly selects elements from the given array. A specific element can only be selected once.
 *
 * @param arr The array of elements to select from
 * @param quantity A tuple of [min, max] number of elements in the final array
 * @param weighted Optional. A decimal percentage, i.e. 0.1, specifying the likehood of getting the minimum or maximum quantity
 * @returns
 */
const selectRandom = <T>(
  arr: T[],
  quantity: [number, number] = [1, 1],
  weighted?: number,
): T[] => {
  // Ensure input is valid
  if (arr.length === 0) {
    throw new Error("Input array is empty");
  }

  if (quantity[0] < 0 || quantity[1] < 0) {
    throw new Error("Quantity bounds must be non-negative");
  }

  if (quantity[1] < quantity[0]) {
    throw new Error(
      "Upper quantity bound must be greater or equal to lower bound",
    );
  }

  if (quantity[1] > arr.length) {
    throw new Error("Upper quantity bound cannot be greater than array length");
  }

  // Determine the actual quantity to select
  let actualQuantity: number;
  if (weighted !== undefined) {
    const rand = Math.random();
    if (rand < weighted) {
      actualQuantity = quantity[1];
    } else if (rand > 1 - weighted) {
      actualQuantity = quantity[0];
    } else {
      actualQuantity =
        Math.floor(rand * (quantity[1] - quantity[0])) + quantity[0];
    }
  } else {
    actualQuantity =
      Math.floor(Math.random() * (quantity[1] - quantity[0] + 1)) + quantity[0];
  }

  // Create a copy of the array to avoid modifying the original
  const arrCopy = [...arr];

  // Randomly select elements (n = actualQuantity)
  // note: an array element can only be selected once due to splice removing it from the pool once selected
  const result: T[] = [];
  for (let i = 0; i < actualQuantity; i++) {
    const randomIndex = Math.floor(Math.random() * arrCopy.length);
    const [selected] = arrCopy.splice(randomIndex, 1);
    result.push(selected);
  }

  return result;
};

export default selectRandom;
