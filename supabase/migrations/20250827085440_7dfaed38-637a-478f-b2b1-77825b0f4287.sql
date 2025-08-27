-- Create a cron job to automatically complete projects daily at 6 AM
-- This will run the auto-complete-projects edge function every day
select cron.schedule(
  'auto-complete-projects-daily',
  '0 6 * * *', -- Daily at 6:00 AM
  $$
  select
    net.http_post(
        url:='https://rhubaybwftyypfbiuoyc.functions.supabase.co/functions/v1/auto-complete-projects',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJodWJheWJ3ZnR5eXBmYml1b3ljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDA1NzMyNCwiZXhwIjoyMDY5NjMzMzI0fQ.sCdp4kXBQBZmP6lKLmMgkLBYoYGP3H0oFjz2zlQcBCw"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;