-- Allow photos up to 40 MB in both buckets (Supabase free plan: 50 MB per file, 1 GB total storage).
update storage.buckets set file_size_limit = 41943040 where id in ('avatars', 'progress-photos');
