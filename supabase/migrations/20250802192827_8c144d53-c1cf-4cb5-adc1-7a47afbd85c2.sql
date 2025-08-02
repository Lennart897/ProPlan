-- Create demo users for testing
-- Note: These would normally be created through the signup flow

-- First, let's add some demo user data to our profiles table
-- Since we can't directly insert into auth.users, we'll ensure the profiles table can handle manual demo data

-- Create demo profile entries (these will be linked when real auth users are created)
INSERT INTO public.profiles (user_id, display_name, role) VALUES 
('11111111-1111-1111-1111-111111111111', 'Max Müller', 'vertrieb'),
('22222222-2222-2222-2222-222222222222', 'Anna Schmidt', 'supply_chain'),
('33333333-3333-3333-3333-333333333333', 'Lennart Debbele', 'planung')
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;