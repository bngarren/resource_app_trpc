import { prisma_getUserByFirebaseUid } from "../queries/queryUser";

/**
 * ### Gets a user, by the Firebase UID
 *
 * The app's User table associates each user id with a Firebase uid (used for authentication).
 * A logged in user on the client side carries a Firebase UID. Whenever server side queries related
 * to this user are needed, we need to lookup the app's record of this User, i.e. get the User id using
 * their Firebase UID
 *
 * @param uid Firebase UID
 * @returns a User
 */
export const getUserByUid = async (uid: string) => {
  return await prisma_getUserByFirebaseUid(uid);
};
