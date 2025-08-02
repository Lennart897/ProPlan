-- Check current policies and debug the issue
-- Let's see what policies exist and add some debug logging

-- First, let's see all current policies on manufacturing_projects
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'manufacturing_projects';

-- Let's also test the get_user_role function works correctly
-- We'll add a simple test to see if roles are being returned properly