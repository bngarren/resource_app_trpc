-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('REGULAR', 'ARCANE_ELEMENT', 'ARCANE_ENERGY');

-- CreateEnum
CREATE TYPE "ResourceRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('RESOURCE', 'COMPONENT', 'HARVESTER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpawnRegion" (
    "id" TEXT NOT NULL,
    "h3_index" TEXT NOT NULL,
    "h3_resolution" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reset_date" TIMESTAMP(3),

    CONSTRAINT "SpawnRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource_type" "ResourceType" NOT NULL,
    "rarity" "ResourceRarity" NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpawnedResource" (
    "resource_id" TEXT NOT NULL,
    "spawn_region_id" TEXT NOT NULL,
    "h3_index" TEXT NOT NULL,
    "h3_resolution" INTEGER NOT NULL,

    CONSTRAINT "SpawnedResource_pkey" PRIMARY KEY ("resource_id","spawn_region_id")
);

-- CreateTable
CREATE TABLE "UserInventoryItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "UserInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Harvester" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deployed_date" TIMESTAMP(3),
    "meta" JSONB NOT NULL,
    "h3_index" TEXT,
    "initial_energy" INTEGER,
    "energy_start_time" TIMESTAMP(3),
    "energy_end_time" TIMESTAMP(3),

    CONSTRAINT "Harvester_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebase_uid_key" ON "User"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SpawnRegion_h3_index_key" ON "SpawnRegion"("h3_index");

-- CreateIndex
CREATE UNIQUE INDEX "SpawnedResource_h3_index_key" ON "SpawnedResource"("h3_index");

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_spawn_region_id_fkey" FOREIGN KEY ("spawn_region_id") REFERENCES "SpawnRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventoryItem" ADD CONSTRAINT "UserInventoryItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Harvester" ADD CONSTRAINT "Harvester_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
