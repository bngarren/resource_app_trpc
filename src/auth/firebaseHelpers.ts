import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { fbAuth } from "./firebaseAuth";
import config from "../config";

export const signInTestUser = async () => {
  const testUid = config.firebase_test_user_uid;
  const firebaseConfig = JSON.parse(config.firebase_client_config);

  if (!firebaseConfig || !testUid) throw new Error("Cannot sign in TestUser");

  // Initialize Firebase client
  const clientFb = initializeApp(firebaseConfig);
  const clientFbAuth = getAuth(clientFb);

  const customToken = await fbAuth.createCustomToken(testUid);

  const credential = await signInWithCustomToken(clientFbAuth, customToken);
  const idToken = await credential.user.getIdToken();
  const userUid = credential.user.uid;

  return { clientFbAuth, idToken, userUid };
};
