-- Drop existing check constraint if any, then add new one allowing 'hiatus'
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.novels'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.novels DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.novels
  ADD CONSTRAINT novels_status_check
  CHECK (status IN ('ongoing', 'completed', 'hiatus', 'dropped'));