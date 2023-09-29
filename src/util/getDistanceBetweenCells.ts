import * as h3 from "h3-js";

/**
 * ### Returns the distance between the centers of two h3 cells
 * @param h3Index1 h3 cell 1
 * @param h3Index2 h3 cell 2
 * @returns Distance, in **meters** (Great Circle distance)
 */
export const getDistanceBetweenCells = (h3Index1: string, h3Index2: string) => {
  return h3.greatCircleDistance(
    h3.cellToLatLng(h3Index1),
    h3.cellToLatLng(h3Index2),
    h3.UNITS.m,
  );
};
