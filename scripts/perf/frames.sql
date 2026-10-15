-- Main-thread frames (Choreographer#doFrame) of the app: rate, duration percentiles and the share
-- over a 60 Hz budget. With the game canvas a SurfaceView, these are the game frames players see.
CREATE PERFETTO TABLE app AS SELECT upid, pid FROM process WHERE name LIKE 'com.johanssoninteractive.tiltling%' LIMIT 1;
CREATE PERFETTO TABLE f AS SELECT sl.ts, sl.dur FROM slice sl JOIN thread_track tt ON sl.track_id=tt.id JOIN thread t USING(utid) WHERE t.tid=(SELECT pid FROM app) AND sl.name LIKE 'Choreographer#doFrame%' ORDER BY sl.ts;
CREATE PERFETTO TABLE r AS SELECT dur, ROW_NUMBER() OVER (ORDER BY dur) AS rn, COUNT(*) OVER () AS n FROM f;
SELECT
  ROUND(((SELECT MAX(ts) FROM f) - (SELECT MIN(ts) FROM f)) / 1e9, 1) AS seconds,
  ROUND((SELECT COUNT(*) FROM f) * 1e9 / ((SELECT MAX(ts) FROM f) - (SELECT MIN(ts) FROM f)), 1) AS frames_per_s,
  (SELECT ROUND(dur/1e6,1) FROM r WHERE rn = CAST(n*0.5 AS INT)) AS p50_ms,
  (SELECT ROUND(dur/1e6,1) FROM r WHERE rn = CAST(n*0.95 AS INT)) AS p95_ms,
  (SELECT ROUND(dur/1e6,1) FROM r WHERE rn = CAST(n*0.99 AS INT)) AS p99_ms,
  ROUND((SELECT COUNT(*) FROM f WHERE dur > 16.67e6) * 100.0 / (SELECT COUNT(*) FROM f), 1) AS pct_over_budget;
