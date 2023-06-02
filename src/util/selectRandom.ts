const selectRandom = (arr: string[], quantity: number) => {
    const result = [...Array(quantity)].map(() => {
      return arr[Math.floor(Math.random() * arr.length)];
    });
    return result;
  };

  export default selectRandom