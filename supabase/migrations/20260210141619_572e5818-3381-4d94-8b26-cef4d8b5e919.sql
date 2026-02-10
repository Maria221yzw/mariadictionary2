
-- Create vocab_table for word lookups
CREATE TABLE public.vocab_table (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  word TEXT NOT NULL,
  phonetic TEXT,
  chinese_definition TEXT NOT NULL,
  lookup_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(word)
);

-- Enable RLS and allow public read
ALTER TABLE public.vocab_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vocab"
  ON public.vocab_table FOR SELECT
  USING (true);

-- Create application scenario enum
CREATE TYPE public.app_scenario AS ENUM ('学术写作', '翻译练习', '日常口语', '专业课笔记');

-- Create corpus_entries table
CREATE TABLE public.corpus_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES public.vocab_table(id) ON DELETE CASCADE,
  application_scenario public.app_scenario NOT NULL DEFAULT '学术写作',
  source_text TEXT DEFAULT '',
  personal_notes TEXT DEFAULT '',
  custom_tags TEXT[] DEFAULT '{}',
  difficulty_level TEXT NOT NULL DEFAULT '进阶',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for corpus_entries
ALTER TABLE public.corpus_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own corpus entries"
  ON public.corpus_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own corpus entries"
  ON public.corpus_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own corpus entries"
  ON public.corpus_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own corpus entries"
  ON public.corpus_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_corpus_entries_updated_at
  BEFORE UPDATE ON public.corpus_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
