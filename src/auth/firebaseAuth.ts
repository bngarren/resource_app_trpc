import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import config from "../config";
import { logger } from "../logger/logger";

/*
Firebase Admin SDK needs to be initialized with a service account.

A service account is an account associated with your Firebase project that is used to authenticate
these server-to-server interactions.
*/
const serviceAccount = JSON.parse(config.firebase_service_acct_key || "");

export const fbAdmin = initializeApp({
  credential: cert(serviceAccount),
});

export const fbAuth = getAuth();

// Function to decode and verify JWT token
export const decodeAndVerifyJwtToken = async (idToken: string) => {
  try {
    // Verify the ID token using Firebase Admin SDK.
    // The SDK decodes the token and checks if it is signed by the correct private key corresponding to the service account.
    // If successful, this function returns a decoded token object.
    const decodedToken = await fbAuth.verifyIdToken(idToken);

    // The decoded token object contains the claims of the token which includes user details and token issue/expire times.
    // Here we're extracting the UID of the user from the decoded token.
    const uid = decodedToken.uid;

    // Fetch the user associated with the provided UID.
    const user = await fbAuth.getUser(uid);

    // Return the user.
    return user;
  } catch (error) {
    // In case of an error (e.g. the token is invalid, expired, or does not have correct permissions), throw the error.
    logger.warn(`Firebase auth rejected the idToken`);
    // We don't re-throw it, we just let the user return undefined
  }
};
