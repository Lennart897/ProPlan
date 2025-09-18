-- Create customers table
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_number text NOT NULL UNIQUE,
  name text NOT NULL,
  representative_id uuid REFERENCES public.profiles(user_id),
  representative_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create articles table
CREATE TABLE public.articles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artikel_nummer text NOT NULL UNIQUE,
  artikel_bezeichnung text NOT NULL,
  produktgruppe text,
  produktgruppe_2 text,
  verkaufseinheit text,
  grammatur_verkaufseinheit numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on articles
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Add foreign key references to manufacturing_projects
ALTER TABLE public.manufacturing_projects 
ADD COLUMN customer_id uuid REFERENCES public.customers(id),
ADD COLUMN article_id uuid REFERENCES public.articles(id);

-- Create RLS policies for customers
CREATE POLICY "Vertrieb can manage customers" ON public.customers
FOR ALL USING (get_user_role(auth.uid()) = 'vertrieb');

CREATE POLICY "Admin can manage customers" ON public.customers
FOR ALL USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated users can view active customers" ON public.customers
FOR SELECT USING (active = true AND auth.uid() IS NOT NULL);

-- Create RLS policies for articles
CREATE POLICY "Vertrieb can manage articles" ON public.articles
FOR ALL USING (get_user_role(auth.uid()) = 'vertrieb');

CREATE POLICY "Admin can manage articles" ON public.articles
FOR ALL USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Authenticated users can view active articles" ON public.articles
FOR SELECT USING (active = true AND auth.uid() IS NOT NULL);

-- Create trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on articles
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();