-- Dashboard metrics, computed in the database and returned as one JSON object so
-- the API layer (GET /api/tickets/stats) just calls this function and validates
-- the result. This mirrors what the endpoint used to compute in TypeScript.
--
--   * counts exclude the intake-hidden 'new'/'processing' statuses, so `total` is
--     open + resolved + closed
--   * ai_resolved = resolved tickets still assigned to the AI agent (its id is
--     passed in, keeping this function decoupled from the app constant)
--   * avg_resolution_ms approximates time-to-resolution as updatedAt - createdAt
--     (null when there are no resolved tickets)
--   * daily = a zero-filled series of the last `window_days` UTC days, oldest to
--     newest, of tickets created per day (same status exclusions as `total`)
--
-- "createdAt"/"updatedAt" are `timestamp without time zone` holding UTC, so a
-- plain `::date` cast yields the UTC calendar day (matching how the app buckets).
CREATE OR REPLACE FUNCTION ticket_stats(ai_agent_id text, window_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH resolved AS (
    SELECT "assigneeId", "createdAt", "updatedAt"
    FROM "ticket"
    WHERE status = 'resolved'
  ),
  day_series AS (
    SELECT ((now() AT TIME ZONE 'UTC')::date - offs) AS day
    FROM generate_series(0, window_days - 1) AS offs
  ),
  daily AS (
    SELECT
      to_char(ds.day, 'YYYY-MM-DD') AS date,
      (
        SELECT count(*)::int
        FROM "ticket" t
        WHERE t.status NOT IN ('new', 'processing')
          AND t."createdAt"::date = ds.day
      ) AS count
    FROM day_series ds
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM "ticket" WHERE status NOT IN ('new', 'processing')),
    'open', (SELECT count(*)::int FROM "ticket" WHERE status = 'open'),
    'resolved', (SELECT count(*)::int FROM resolved),
    'aiResolved', (SELECT count(*)::int FROM resolved WHERE "assigneeId" = ai_agent_id),
    'avgResolutionMs', (
      SELECT round(avg(extract(epoch FROM ("updatedAt" - "createdAt")) * 1000))::bigint
      FROM resolved
    ),
    'daily', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('date', date, 'count', count) ORDER BY date)
        FROM daily
      ),
      '[]'::jsonb
    )
  );
$$;
