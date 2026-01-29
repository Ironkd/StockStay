-- Check if tables exist in Supabase
-- Run this in Supabase SQL Editor

-- Check if User table exists
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'User'
ORDER BY ordinal_position;

-- Check if Team table exists and has plan columns
SELECT 
  table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'Team'
ORDER BY ordinal_position;

-- Check if Warehouse table exists
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'Warehouse'
ORDER BY ordinal_position;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
