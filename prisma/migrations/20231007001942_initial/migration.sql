-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('REGULAR', 'ARCANE_ELEMENT', 'ARCANE_ENERGY');

-- CreateEnum
CREATE TYPE "ResourceRarityLevel" AS ENUM ('VERY_COMMON', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

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
CREATE TABLE "ResourceRarity" (
    "level" "ResourceRarityLevel" NOT NULL DEFAULT 'VERY_COMMON',
    "name" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ResourceRarity_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "resource_type" "ResourceType" NOT NULL,
    "resourceRarityLevel" "ResourceRarityLevel" NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpawnedResource" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "spawn_region_id" TEXT NOT NULL,
    "h3_index" TEXT NOT NULL,
    "h3_resolution" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SpawnedResource_pkey" PRIMARY KEY ("id")
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
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deployed_date" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "h3_index" TEXT,
    "initial_energy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "energy_start_time" TIMESTAMP(3),
    "energy_end_time" TIMESTAMP(3),
    "energy_source_id" TEXT,

    CONSTRAINT "Harvester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestOperation" (
    "id" TEXT NOT NULL,
    "harvester_id" TEXT NOT NULL,
    "spawned_resource_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "priorPeriodHarvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "HarvestOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebase_uid_key" ON "User"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SpawnRegion_h3_index_key" ON "SpawnRegion"("h3_index");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceRarity_likelihood_key" ON "ResourceRarity"("likelihood");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_url_key" ON "Resource"("url");

-- CreateIndex
CREATE UNIQUE INDEX "SpawnedResource_h3_index_key" ON "SpawnedResource"("h3_index");

-- CreateIndex
CREATE UNIQUE INDEX "SpawnedResource_h3_index_spawn_region_id_key" ON "SpawnedResource"("h3_index", "spawn_region_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserInventoryItem_user_id_item_id_key" ON "UserInventoryItem"("user_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "Harvester_id_user_id_key" ON "Harvester"("id", "user_id");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_resourceRarityLevel_fkey" FOREIGN KEY ("resourceRarityLevel") REFERENCES "ResourceRarity"("level") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_spawn_region_id_fkey" FOREIGN KEY ("spawn_region_id") REFERENCES "SpawnRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInventoryItem" ADD CONSTRAINT "UserInventoryItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Harvester" ADD CONSTRAINT "Harvester_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestOperation" ADD CONSTRAINT "HarvestOperation_harvester_id_fkey" FOREIGN KEY ("harvester_id") REFERENCES "Harvester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestOperation" ADD CONSTRAINT "HarvestOperation_spawned_resource_id_fkey" FOREIGN KEY ("spawned_resource_id") REFERENCES "SpawnedResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
