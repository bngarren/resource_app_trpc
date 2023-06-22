import { ScanResult } from "../types";
import { logger } from "./logger";

type NestedUnknown<T> = {
  [P in keyof T]: unknown;
};

/**
 * ### Logs a ScanResult in abbreviated format
 * Uses the pino logger instance
 * @param scanResult 
 */
export const logScanResult = (scanResult: ScanResult) => {
  const interactablesLog = `There are ${scanResult.interactables.length} included.`;

  const result: NestedUnknown<Required<ScanResult>> = {
    metadata: {
      scannedLocation: scanResult.metadata.scannedLocation,
      timestamp: scanResult.metadata.timestamp,
    },
    scanPolygons: {
      centerPolygon: scanResult.scanPolygons.centerPolygon != null,
      peripheralPolygons: scanResult.scanPolygons.peripheralPolygons.length,
    },
    neighboringPolygons: scanResult.neighboringPolygons.length,
    interactables: interactablesLog,
    sortedCanInteractableIds: scanResult.sortedCanInteractableIds.length,
  };

  logger.info(result, "Scan Result");
  if (scanResult.interactables.length > 0) {
    logger.debug(scanResult.interactables[0], "Example interactable");
  }
};
