-- Add policy to allow all authenticated users to view approved projects (status 5)
CREATE POLICY "All authenticated users can view approved projects" 
ON public.manufacturing_projects 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) AND (status = 5)
);