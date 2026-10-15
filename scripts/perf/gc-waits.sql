-- How long the app's main thread sleeps inside the animation phase, by the thread that wakes it.
-- "hades" is Hermes's garbage collector: the UI runtime's collection stalling the frame.
CREATE PERFETTO TABLE app AS SELECT upid, pid FROM process WHERE name LIKE 'com.johanssoninteractive.tiltling%' LIMIT 1;
CREATE PERFETTO TABLE mt AS SELECT utid FROM thread WHERE tid=(SELECT pid FROM app);
CREATE PERFETTO TABLE anim AS SELECT sl.ts, sl.dur FROM slice sl JOIN thread_track tt ON sl.track_id=tt.id WHERE tt.utid=(SELECT utid FROM mt) AND sl.name='animation';
SELECT w.name AS waker, COUNT(*) AS waits, ROUND(SUM(s.dur)/1e6,1) AS total_ms, ROUND(AVG(s.dur)/1e6,2) AS avg_ms
FROM thread_state s JOIN anim a ON s.ts >= a.ts AND s.ts < a.ts + a.dur
LEFT JOIN thread_state nx ON nx.utid=s.utid AND nx.ts = s.ts + s.dur
LEFT JOIN thread w ON w.utid = nx.waker_utid
WHERE s.utid=(SELECT utid FROM mt) AND s.state='S' GROUP BY w.utid ORDER BY total_ms DESC LIMIT 3;
