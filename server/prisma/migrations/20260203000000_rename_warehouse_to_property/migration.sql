-- Rename Warehouse to Property (table and related columns)

-- Rename table Warehouse to Property
ALTER TABLE "Warehouse" RENAME TO "Property";

-- Inventory: warehouseId -> propertyId
ALTER TABLE "Inventory" RENAME COLUMN "warehouseId" TO "propertyId";

-- User: allowedWarehouseIds -> allowedPropertyIds
ALTER TABLE "User" RENAME COLUMN "allowedWarehouseIds" TO "allowedPropertyIds";

-- Team: maxWarehouses -> maxProperties
ALTER TABLE "Team" RENAME COLUMN "maxWarehouses" TO "maxProperties";

-- Invitation: allowedWarehouseIds -> allowedPropertyIds
ALTER TABLE "Invitation" RENAME COLUMN "allowedWarehouseIds" TO "allowedPropertyIds";
