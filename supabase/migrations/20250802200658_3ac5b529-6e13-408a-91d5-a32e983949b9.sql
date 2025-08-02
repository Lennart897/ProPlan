-- Test der get_user_role Funktion mit direkter user_id
SELECT get_user_role('24a5a20a-2615-4307-8e74-7e8420eeef11'::uuid) as role_test;

-- Schaue auch was auth.uid() zurückgibt in der aktuellen Session
SELECT auth.uid() as current_auth_uid;