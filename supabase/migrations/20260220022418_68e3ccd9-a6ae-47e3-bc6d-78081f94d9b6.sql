
-- Create material_entries table for manual corpus materials (sentences, phrases, etc.)
CREATE TABLE public.material_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  notes TEXT,
  source TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT DEFAULT '日常与通用',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.material_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own materials"
  ON public.material_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own materials"
  ON public.material_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own materials"
  ON public.material_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own materials"
  ON public.material_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_material_entries_updated_at
  BEFORE UPDATE ON public.material_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
