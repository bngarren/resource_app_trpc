-- Create Trigger Function for UPDATE item_type
CREATE OR REPLACE FUNCTION check_itemtype_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.item_type IS DISTINCT FROM NEW.item_type THEN
    RAISE EXCEPTION 'The itemType field cannot be modified!';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger for ResourceUserInventoryItem
CREATE TRIGGER trigger_check_itemtype_update_resource
BEFORE UPDATE ON "ResourceUserInventoryItem"
FOR EACH ROW EXECUTE FUNCTION check_itemtype_update();

-- Create Trigger for HarvesterUserInventoryItem
CREATE TRIGGER trigger_check_itemtype_update_harvester
BEFORE UPDATE ON "HarvesterUserInventoryItem"
FOR EACH ROW EXECUTE FUNCTION check_itemtype_update();