-- Update RLS policies to use project ID in path instead of user ID
DROP POLICY IF EXISTS "Users can view attachments for projects they can see" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload project attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update attachments for projects they can update" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments for projects they can update" ON storage.objects;

-- Create new RLS policies that work with project-based folder structure
CREATE POLICY "Users can view project attachments" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Authenticated users can upload to project folders" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'project-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update project attachments" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Users can delete project attachments" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

-- Migrate existing attachments from user-based to project-based structure
DO $$
DECLARE
    rec RECORD;
    old_path text;
    new_path text;
    file_name text;
BEGIN
    -- Find all projects with attachment_urls that start with user IDs
    FOR rec IN 
        SELECT id, attachment_url, created_by_id 
        FROM public.manufacturing_projects 
        WHERE attachment_url IS NOT NULL 
        AND attachment_url LIKE '%-%-%-%-%/%'
        AND attachment_url NOT LIKE 'ca4af3a0-%'  -- Skip if already project-based
    LOOP
        old_path := rec.attachment_url;
        file_name := split_part(old_path, '/', 2);
        new_path := rec.id::text || '/' || file_name;
        
        -- Note: We cannot actually move files in storage via SQL
        -- But we can update the attachment_url to point to the new expected location
        -- The files will need to be manually moved or re-uploaded
        
        UPDATE public.manufacturing_projects 
        SET attachment_url = new_path 
        WHERE id = rec.id;
        
        RAISE LOG 'Updated attachment path for project %: % -> %', rec.id, old_path, new_path;
    END LOOP;
END
$$;