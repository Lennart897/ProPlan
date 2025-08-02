-- Confirm demo user accounts automatically
UPDATE auth.users 
SET email_confirmed_at = now(), 
    confirmation_token = NULL,
    updated_at = now()
WHERE email IN ('vertrieb@demo.com', 'supply@demo.com', 'planung@demo.com')
  AND email_confirmed_at IS NULL;