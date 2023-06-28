import { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "../main";

/**
 * TRPC wraps all HTTP responses in this way, so we create a type that represents this
 * Useful for jest/testing
 */
export interface TRPCResponseData<T> {
  result: {
    data: T;
  };
}

// - - - - The following types help infer types from our TRPC AppRouter
// see https://trpc.io/docs/client/vanilla/infer-types

// * Note: These are the actual inputs and outputs from our TRPC procedures.
// * We may have similar types, such as ScanResult, in our other types files, which are used by
// * our business logic to know the type we intend to return.

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type GreetingRequestOutput = RouterOutput["greeting"];

// Scan routes
export type ScanRequestInput = RouterInput["scan"];
export type ScanRequestOutput = RouterOutput["scan"];

// UserInventory routes
export type GetUserInventoryRequestInput =
  RouterInput["userInventory"]["getUserInventory"];
export type GetUserInventoryRequestOutput =
  RouterOutput["userInventory"]["getUserInventory"];
