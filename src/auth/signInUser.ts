import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { fbAuth } from "./firebaseAuth";
import config from "../config";

export const signInUser = async (uid: string) => {
  let firebaseConfig: Record<string, unknown> | undefined;
  if (!config.firebase_client_config && process.env.NODE_ENV === "test") {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG ?? "");
  } else {
    firebaseConfig = JSON.parse(config.firebase_client_config);
  }
  if (!firebaseConfig || !uid) throw new Error("Cannot sign in user");

  // Initialize Firebase client
  const clientFb = initializeApp(firebaseConfig);
  const clientFbAuth = getAuth(clientFb);

  const customToken = await fbAuth.createCustomToken(uid);

  const credential = await signInWithCustomToken(clientFbAuth, customToken);
  const idToken = await credential.user.getIdToken();
  const userUid = credential.user.uid;

  return { clientFbAuth, idToken, userUid };
};

export const signInTestUser = async () => {
  const testUid = config.firebase_test_user_uid;

  if (!testUid) throw new Error("Cannot sign in TestUser");

  return await signInUser(testUid);
};

if (require.main === module) {
  const uid = process.argv[2];

  if (!uid) {
    console.error("User UID is not provided as a command line argument #1.");
    process.exit(1);
  }

  signInUser(uid)
    .then((result) =>
      console.log("User signed in successfully:", result.idToken),
    )
    .catch((err) => console.error("Error signing in user:", err));
}
