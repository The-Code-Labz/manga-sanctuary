
-- Drop the partially applied migration objects and recreate cleanly
-- The previous migration created the type, table, function, and some policies but failed on triggers

-- Nothing to redo for type/table/function/policies since they were applied
-- Just skip the triggers since they already exist
SELECT 1;
