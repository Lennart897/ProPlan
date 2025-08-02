-- Create trigger to automatically create profiles for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create profiles for existing demo users
INSERT INTO public.profiles (user_id, display_name, role)
SELECT 
  u.id,
  CASE 
    WHEN u.email = 'vertrieb@demo.com' THEN 'Max Müller'
    WHEN u.email = 'supply@demo.com' THEN 'Anna Schmidt'
    WHEN u.email = 'planung@demo.com' THEN 'Lennart Debbele'
    ELSE u.email
  END as display_name,
  CASE 
    WHEN u.email = 'vertrieb@demo.com' THEN 'vertrieb'
    WHEN u.email = 'supply@demo.com' THEN 'supply_chain'
    WHEN u.email = 'planung@demo.com' THEN 'planung'
    ELSE 'planung'
  END as role
FROM auth.users u
WHERE u.email IN ('vertrieb@demo.com', 'supply@demo.com', 'planung@demo.com')
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role;