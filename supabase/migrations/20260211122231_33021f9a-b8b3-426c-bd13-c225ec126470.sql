
-- 1. Add user_id to vocab_table
ALTER TABLE public.vocab_table ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill existing rows: assign to the first user who has a corpus_entry referencing them, or delete orphans
UPDATE public.vocab_table v
SET user_id = (
  SELECT ce.user_id FROM public.corpus_entries ce WHERE ce.word_id = v.id LIMIT 1
);
-- Delete orphan vocab entries with no user
DELETE FROM public.vocab_table WHERE user_id IS NULL;

-- Make user_id NOT NULL
ALTER TABLE public.vocab_table ALTER COLUMN user_id SET NOT NULL;

-- 2. Add unique constraint on (user_id, word) to prevent duplicates per user
ALTER TABLE public.vocab_table ADD CONSTRAINT vocab_table_user_word_unique UNIQUE (user_id, word);

-- 3. Drop old permissive RLS policies on vocab_table
DROP POLICY IF EXISTS "Anyone can insert vocab" ON public.vocab_table;
DROP POLICY IF EXISTS "Anyone can read vocab" ON public.vocab_table;
DROP POLICY IF EXISTS "Anyone can update vocab lookup count" ON public.vocab_table;

-- 4. Create user-scoped RLS policies
CREATE POLICY "Users can read own vocab"
ON public.vocab_table FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vocab"
ON public.vocab_table FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vocab"
ON public.vocab_table FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vocab"
ON public.vocab_table FOR DELETE
USING (auth.uid() = user_id);

-- 5. Add CHECK constraints for input validation at DB level
ALTER TABLE public.corpus_entries
ADD CONSTRAINT corpus_notes_length CHECK (length(personal_notes) <= 2000);

ALTER TABLE public.corpus_entries
ADD CONSTRAINT corpus_source_length CHECK (length(source_text) <= 500);

ALTER TABLE public.vocab_table
ADD CONSTRAINT vocab_word_length CHECK (length(word) <= 100);

ALTER TABLE public.vocab_table
ADD CONSTRAINT vocab_definition_length CHECK (length(chinese_definition) <= 500);
