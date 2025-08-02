-- Neue Spalten zur manufacturing_projects Tabelle hinzufügen
ALTER TABLE public.manufacturing_projects 
ADD COLUMN preis DECIMAL(10,2),
ADD COLUMN erste_anlieferung DATE,
ADD COLUMN letzte_anlieferung DATE,
ADD COLUMN produktgruppe TEXT;