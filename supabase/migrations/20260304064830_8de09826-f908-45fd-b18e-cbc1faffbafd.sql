
-- Add notes column to synonym_clusters for storing nuance analysis notes
ALTER TABLE public.synonym_clusters ADD COLUMN notes text DEFAULT NULL;
