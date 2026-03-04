
-- Make vocab_id nullable to support custom (non-library) words
ALTER TABLE public.synonym_cluster_members ALTER COLUMN vocab_id DROP NOT NULL;

-- Add custom_word column for storing non-library word strings
ALTER TABLE public.synonym_cluster_members ADD COLUMN custom_word text;

-- Add a check constraint: either vocab_id or custom_word must be set
ALTER TABLE public.synonym_cluster_members ADD CONSTRAINT chk_vocab_or_custom 
  CHECK (vocab_id IS NOT NULL OR custom_word IS NOT NULL);
