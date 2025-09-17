-- Create storage bucket for project attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('project-attachments', 'project-attachments', false);

-- Create RLS policies for project attachments bucket
CREATE POLICY "Users can view attachments for projects they can see" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Authenticated users can upload project attachments" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'project-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update attachments for projects they can update" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Users can delete attachments for projects they can update" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'project-attachments' 
  AND EXISTS (
    SELECT 1 FROM public.manufacturing_projects mp 
    WHERE mp.id::text = (storage.foldername(name))[1]
  )
);

-- Add attachment_url column to manufacturing_projects table
ALTER TABLE public.manufacturing_projects 
ADD COLUMN attachment_url text;