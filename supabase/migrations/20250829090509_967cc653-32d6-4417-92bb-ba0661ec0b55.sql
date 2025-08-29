-- Check if rejection_reason column exists and add it if missing
DO $$
BEGIN
  -- Add rejection_reason column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'manufacturing_projects' 
                 AND column_name = 'rejection_reason' 
                 AND table_schema = 'public') THEN
    ALTER TABLE public.manufacturing_projects 
    ADD COLUMN rejection_reason text;
    
    RAISE LOG 'Added rejection_reason column to manufacturing_projects';
  ELSE
    RAISE LOG 'rejection_reason column already exists in manufacturing_projects';
  END IF;
END $$;