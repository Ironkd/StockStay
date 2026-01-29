-- Check if Team table has plan columns
-- Run this in Supabase SQL Editor

SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Team'
ORDER BY ordinal_position;

-- If you see 'plan' and 'maxWarehouses' columns, they exist!
-- If not, run create-warehouse-table.sql
