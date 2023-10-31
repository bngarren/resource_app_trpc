#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Get the latest migration directory
LATEST_MIGRATION_DIR=$(ls -td prisma/migrations/*/ | head -1)

# Define the trigger migration SQL
TRIGGER_MIGRATION_SQL=$(cat <<- EOM

-- Create Trigger Function
CREATE OR REPLACE FUNCTION check_itemtype_update()
RETURNS TRIGGER AS \$\$
BEGIN
  IF OLD.item_type IS DISTINCT FROM NEW.item_type THEN
    RAISE EXCEPTION 'The itemType field cannot be modified!';
  END IF;
  RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

-- Create Trigger for ResourceUserInventoryItem
CREATE TRIGGER trigger_check_itemtype_update_resource
BEFORE UPDATE ON "ResourceUserInventoryItem"
FOR EACH ROW EXECUTE FUNCTION check_itemtype_update();

-- Create Trigger for HarvesterUserInventoryItem
CREATE TRIGGER trigger_check_itemtype_update_harvester
BEFORE UPDATE ON "HarvesterUserInventoryItem"
FOR EACH ROW EXECUTE FUNCTION check_itemtype_update();
EOM
)

# Append the trigger migration SQL to the latest migration file
echo "$TRIGGER_MIGRATION_SQL" >> "$LATEST_MIGRATION_DIR/migration.sql"

echo "Trigger migration SQL appended to $LATEST_MIGRATION_DIR/migration.sql"
