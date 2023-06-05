const selectRandom = <T>(
  arr: T[],
  quantity: [number, number] = [1, 1]
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
      "Upper quantity bound must be greater or equal to lower bound"
    );
  }

  if (quantity[1] > arr.length) {
    throw new Error("Upper quantity bound cannot be greater than array length");
  }

  // Determine the actual quantity to select
  const actualQuantity =
    Math.floor(Math.random() * (quantity[1] - quantity[0] + 1)) + quantity[0];

  // Create a copy of the array to avoid modifying the original
  const arrCopy = [...arr];

  // Randomly select elements
  const result: T[] = [];
  for (let i = 0; i < actualQuantity; i++) {
    const randomIndex = Math.floor(Math.random() * arrCopy.length);
    const [selected] = arrCopy.splice(randomIndex, 1);
    result.push(selected);
  }

  return result;
};

export default selectRandom;
