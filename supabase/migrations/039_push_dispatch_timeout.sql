-- ============================================================
-- 039 — Give the push-dispatch cron call a realistic HTTP timeout
--
-- The dispatch job scheduled in migration 015 calls the
-- send-push-notifications Edge Function through net.http_post without a
-- timeout, so it inherits pg_net's 5s default. A cold-started Edge Function
-- regularly needs longer than that: as of 2026-07-28 roughly 8% of the
-- once-a-minute ticks came back as `Timeout of 5000 ms reached` with a NULL
-- status_code in net._http_response.
--
-- Nothing was actually lost — pg_net giving up does not cancel the function,
-- which keeps draining the outbox, and the next tick is a minute away anyway.
-- The cost is diagnostic: a genuine failure is currently indistinguishable
-- from a slow cold start, which makes the response log useless for spotting
-- the former. 20s is comfortably above a cold start and still well under the
-- one-minute schedule, so a hung call can never overlap the next tick.
--
-- cron.schedule() on an existing jobname replaces it in place, so this is the
-- same "re-declare the job" pattern migration 015 uses, not a second job.
-- ============================================================

DO $do$
BEGIN
  PERFORM cron.schedule(
    'push-notifications-dispatch',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url     := 'https://fuskxhhwkanenwmmoytu.supabase.co/functions/v1/send-push-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net unavailable (%); push dispatch timeout left at the default', SQLERRM;
END;
$do$;
