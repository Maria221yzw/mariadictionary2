
-- Synonym Clusters: groups of related words
CREATE TABLE public.synonym_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_name TEXT NOT NULL DEFAULT '未命名词簇',
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.synonym_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own clusters" ON public.synonym_clusters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clusters" ON public.synonym_clusters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clusters" ON public.synonym_clusters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clusters" ON public.synonym_clusters FOR DELETE USING (auth.uid() = user_id);

-- Cluster members: links vocab words to clusters
CREATE TABLE public.synonym_cluster_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_id UUID NOT NULL REFERENCES public.synonym_clusters(id) ON DELETE CASCADE,
  vocab_id UUID NOT NULL REFERENCES public.vocab_table(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cluster_id, vocab_id)
);

ALTER TABLE public.synonym_cluster_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own members" ON public.synonym_cluster_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own members" ON public.synonym_cluster_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own members" ON public.synonym_cluster_members FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at on clusters
CREATE TRIGGER update_synonym_clusters_updated_at
BEFORE UPDATE ON public.synonym_clusters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
