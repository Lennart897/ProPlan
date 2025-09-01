-- Check if rejection_reason column exists and add it if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'manufacturing_projects' 
        AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE public.manufacturing_projects 
        ADD COLUMN rejection_reason text;
        
        RAISE NOTICE 'Added rejection_reason column to manufacturing_projects table';
    ELSE
        RAISE NOTICE 'rejection_reason column already exists in manufacturing_projects table';
    END IF;
END $$;