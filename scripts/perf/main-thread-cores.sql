-- Where the app's main thread runs: its time inside the animation phase per frame by thread
-- state and core type, and the clock of the core while it runs. On the Snapdragon 888, CPUs 0-3
-- are Cortex-A55 (little, up to 1.8 GHz), 4-6 Cortex-A78 (big, 2.42 GHz) and 7 Cortex-X1
-- (prime, 2.84 GHz). Most of the animation phase is worklets and Skia, which atrace doesn't
-- split; a CPU profile does (see docs/android-performance-2026-10-15.md).
CREATE PERFETTO TABLE app AS SELECT upid, pid FROM process WHERE name LIKE 'com.johanssoninteractive.tiltling%' LIMIT 1;
CREATE PERFETTO TABLE mt AS SELECT utid FROM thread WHERE tid=(SELECT pid FROM app);
CREATE PERFETTO TABLE anim AS SELECT s.ts, s.dur FROM slice s JOIN thread_track tt ON s.track_id=tt.id WHERE tt.utid=(SELECT utid FROM mt) AND s.name='animation';
CREATE PERFETTO TABLE freq AS SELECT t.cpu, c.ts, LEAD(c.ts) OVER (PARTITION BY t.cpu ORDER BY c.ts) AS e, c.value
  FROM counter c JOIN cpu_counter_track t ON c.track_id=t.id WHERE t.name='cpufreq';
CREATE PERFETTO TABLE run AS SELECT s.cpu, MAX(s.ts, a.ts) AS ts, MIN(s.ts + s.dur, a.ts + a.dur) AS e, s.state
  FROM thread_state s JOIN anim a ON s.ts < a.ts + a.dur AND s.ts + s.dur > a.ts WHERE s.utid=(SELECT utid FROM mt);
SELECT CASE WHEN r.state <> 'Running' THEN r.state WHEN r.cpu < 4 THEN 'running, little' WHEN r.cpu < 7 THEN 'running, big' ELSE 'running, prime' END AS where_,
  ROUND(SUM(r.e - r.ts) / 1e6 / (SELECT COUNT(*) FROM anim), 2) AS ms_per_frame,
  ROUND(SUM(r.e - r.ts) * 100.0 / (SELECT SUM(dur) FROM anim), 1) AS pct_of_animation,
  (SELECT ROUND(SUM((MIN(x.e, f.e) - MAX(x.ts, f.ts)) * f.value) / SUM(MIN(x.e, f.e) - MAX(x.ts, f.ts)) / 1e6, 2)
     FROM run x JOIN freq f ON f.cpu = x.cpu AND x.ts < f.e AND x.e > f.ts
     WHERE x.state = 'Running' AND (CASE WHEN x.cpu < 4 THEN 0 WHEN x.cpu < 7 THEN 1 ELSE 2 END) = (CASE WHEN r.cpu < 4 THEN 0 WHEN r.cpu < 7 THEN 1 ELSE 2 END)
       AND r.state = 'Running') AS avg_ghz
FROM run r GROUP BY where_ ORDER BY ms_per_frame DESC;
