import { PrismaClientOrTransaction, prisma } from "../prisma";

/**
 * ### Gets a User, by the Firebase uid
 * @param uid The userUid from Firebase authentication
 * @param prismaClient
 * @returns
 */
export const prisma_getUserByFirebaseUid = async (
  uid: string,
  prismaClient: PrismaClientOrTransaction = prisma,
) => {
  return prismaClient.user.findUniqueOrThrow({
    where: {
      firebase_uid: uid,
    },
  });
};
