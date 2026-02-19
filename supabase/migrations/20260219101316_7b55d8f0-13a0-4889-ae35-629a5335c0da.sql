ALTER TABLE public.vocab_table ADD COLUMN mastery_level integer NOT NULL DEFAULT 1;

ALTER TABLE public.vocab_table ADD CONSTRAINT mastery_level_range CHECK (mastery_level >= 1 AND mastery_level <= 5);