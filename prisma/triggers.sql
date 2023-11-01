

-- * * * The below SQL must be executed AFTER the initial migration that generates the TABLES! * * *
-- The string literals used here, e.g. 'RESOURCE', 'HARVESTER', must match the ItemType ENUM!


-- Function to enforce itemType for ResourceUserInventoryItem
CREATE FUNCTION set_resource_item_type() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type <> 'RESOURCE' THEN
    RAISE WARNING 'itemType was attempted to be set to %, overriding to RESOURCE', NEW.item_type;
    NEW.item_type := 'RESOURCE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for ResourceUserInventoryItem
CREATE TRIGGER enforce_resource_type
  BEFORE INSERT OR UPDATE ON "ResourceUserInventoryItem"
  FOR EACH ROW EXECUTE FUNCTION set_resource_item_type();

-- Function to enforce itemType for HarvesterUserInventoryItem
CREATE FUNCTION set_harvester_item_type() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.item_type <> 'HARVESTER' THEN
    RAISE WARNING 'itemType was attempted to be set to %, overriding to HARVESTER', NEW.item_type;
    NEW.item_type := 'HARVESTER';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for HarvesterUserInventoryItem
CREATE TRIGGER enforce_harvester_type
  BEFORE INSERT OR UPDATE ON "HarvesterUserInventoryItem"
  FOR EACH ROW EXECUTE FUNCTION set_harvester_item_type();



