-- Fix the confirmation_token issue by setting it to an empty string instead of NULL
UPDATE auth.users 
SET confirmation_token = '',
    email_confirmed_at = now(),
    updated_at = now()
WHERE email IN ('vertrieb@demo.com', 'supply@demo.com', 'planung@demo.com');