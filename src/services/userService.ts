import { getUserByFirebaseUid } from "../queries/queryUser";

export const getUserByUid = async (uid: string) => {
  return await getUserByFirebaseUid(uid);
};
