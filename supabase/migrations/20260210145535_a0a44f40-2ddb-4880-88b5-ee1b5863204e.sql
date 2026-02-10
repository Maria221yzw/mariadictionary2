
-- Allow anyone to insert into vocab_table (shared vocabulary)
CREATE POLICY "Anyone can insert vocab"
ON public.vocab_table
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update lookup_count
CREATE POLICY "Anyone can update vocab lookup count"
ON public.vocab_table
FOR UPDATE
USING (true)
WITH CHECK (true);
