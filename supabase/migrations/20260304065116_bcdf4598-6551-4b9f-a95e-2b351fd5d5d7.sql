
-- Add UPDATE policy for synonym_cluster_members (needed for merge logic)
CREATE POLICY "Users can update own members"
ON public.synonym_cluster_members
FOR UPDATE
USING (auth.uid() = user_id);
