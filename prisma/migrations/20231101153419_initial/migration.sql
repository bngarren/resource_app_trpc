-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('REGULAR', 'ARCANE_ELEMENT', 'ARCANE_ENERGY');

-- CreateEnum
CREATE TYPE "ResourceRarityLevel" AS ENUM ('VERY_COMMON', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('RESOURCE', 'HARVESTER');

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
    "resource_type" "ResourceType" NOT NULL,
    "resourceRarityLevel" "ResourceRarityLevel" NOT NULL,
    "energy_efficiency" DOUBLE PRECISION,

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
    "priorHarvested" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HarvestOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceUserInventoryItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL DEFAULT 'RESOURCE',
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ResourceUserInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvesterUserInventoryItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "harvester_id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL DEFAULT 'HARVESTER',
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "HarvesterUserInventoryItem_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Harvester_id_user_id_key" ON "Harvester"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceUserInventoryItem_user_id_resource_id_key" ON "ResourceUserInventoryItem"("user_id", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "HarvesterUserInventoryItem_user_id_harvester_id_key" ON "HarvesterUserInventoryItem"("user_id", "harvester_id");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_resourceRarityLevel_fkey" FOREIGN KEY ("resourceRarityLevel") REFERENCES "ResourceRarity"("level") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpawnedResource" ADD CONSTRAINT "SpawnedResource_spawn_region_id_fkey" FOREIGN KEY ("spawn_region_id") REFERENCES "SpawnRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Harvester" ADD CONSTRAINT "Harvester_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestOperation" ADD CONSTRAINT "HarvestOperation_harvester_id_fkey" FOREIGN KEY ("harvester_id") REFERENCES "Harvester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestOperation" ADD CONSTRAINT "HarvestOperation_spawned_resource_id_fkey" FOREIGN KEY ("spawned_resource_id") REFERENCES "SpawnedResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUserInventoryItem" ADD CONSTRAINT "ResourceUserInventoryItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceUserInventoryItem" ADD CONSTRAINT "ResourceUserInventoryItem_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvesterUserInventoryItem" ADD CONSTRAINT "HarvesterUserInventoryItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvesterUserInventoryItem" ADD CONSTRAINT "HarvesterUserInventoryItem_harvester_id_fkey" FOREIGN KEY ("harvester_id") REFERENCES "Harvester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- This SQL must be executed AFTER the initial migration that generates the TABLES!


-- Generalized function to enforce itemType for ResourceUserInventoryItem
CREATE FUNCTION set_resource_item_type() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type <> 'RESOURCE' THEN
    RAISE NOTICE 'itemType was attempted to be set to %, overriding to RESOURCE', NEW.item_type;
    NEW.item_type := 'RESOURCE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for ResourceUserInventoryItem
CREATE TRIGGER enforce_resource_type
  BEFORE INSERT OR UPDATE ON "ResourceUserInventoryItem"
  FOR EACH ROW EXECUTE FUNCTION set_resource_item_type();

-- Generalized function to enforce itemType for HarvesterUserInventoryItem
CREATE FUNCTION set_harvester_item_type() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type <> 'HARVESTER' THEN
    RAISE NOTICE 'itemType was attempted to be set to %, overriding to HARVESTER', NEW.item_type;
    NEW.item_type := 'HARVESTER';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for HarvesterUserInventoryItem
CREATE TRIGGER enforce_harvester_type
  BEFORE INSERT OR UPDATE ON "HarvesterUserInventoryItem"
  FOR EACH ROW EXECUTE FUNCTION set_harvester_item_type();



