-- Buffer handoffs from the app's main thread, by the buffer queue they went to.
-- A Skia render ends in eglSwapBuffers, which wraps Surface::queueBuffer, which wraps
-- BufferQueueProducer::queueBuffer: the two nested "queueBuffer" slices are one handoff, not two.
-- The consumer names the view: "SurfaceView[...](BLAST Consumer)" is a SurfaceView, whose
-- BLASTBufferQueue consumer runs in the app (its onFrameAvailable → processNextBufferLocked sends
-- the buffer to SurfaceFlinger with setTransactionState, a blocking binder call);
-- "SurfaceTexture-*" is a TextureView.
CREATE PERFETTO TABLE app AS SELECT upid, pid FROM process WHERE name LIKE 'com.johanssoninteractive.tiltling%' LIMIT 1;
CREATE PERFETTO TABLE mt AS SELECT tt.id AS track_id FROM thread_track tt JOIN thread t USING(utid) WHERE t.tid=(SELECT pid FROM app);
CREATE PERFETTO TABLE frames AS SELECT COUNT(*) AS n FROM slice WHERE track_id IN (SELECT track_id FROM mt) AND name LIKE 'Choreographer#doFrame%';
CREATE PERFETTO TABLE swaps AS SELECT id, ts, dur, track_id, depth FROM slice WHERE track_id IN (SELECT track_id FROM mt) AND name='eglSwapBuffers';
CREATE PERFETTO TABLE named AS
SELECT sw.id, sw.dur,
  (SELECT RTRIM(RTRIM(d.name, '0123456789'), ': ') FROM slice d
   WHERE d.track_id=sw.track_id AND d.ts >= sw.ts AND d.ts < sw.ts + sw.dur AND d.depth > sw.depth
     AND (d.name LIKE '%(BLAST Consumer)%' OR d.name LIKE 'SurfaceTexture-%') LIMIT 1) AS consumer,
  (SELECT SUM(d.dur) FROM slice d WHERE d.track_id=sw.track_id AND d.ts >= sw.ts AND d.ts < sw.ts + sw.dur
     AND d.depth = sw.depth + 1 AND d.name='queueBuffer') AS queue_dur,
  (SELECT SUM(d.dur) FROM slice d WHERE d.track_id=sw.track_id AND d.ts >= sw.ts AND d.ts < sw.ts + sw.dur
     AND d.name='processNextBufferLocked') AS to_sf_dur
FROM swaps sw;
SELECT
  CASE WHEN consumer LIKE '%BLAST Consumer%' THEN 'SurfaceView: ' ELSE 'TextureView: ' END || COALESCE(consumer, '?') AS buffer_queue,
  COUNT(*) AS handoffs,
  ROUND(COUNT(*) * 1.0 / (SELECT n FROM frames), 2) AS per_frame,
  ROUND(SUM(dur) / 1e6) AS swap_ms,
  ROUND(SUM(queue_dur) / 1e6) AS queue_ms,
  ROUND(SUM(to_sf_dur) / 1e6) AS to_surfaceflinger_ms,
  ROUND(AVG(queue_dur) / 1e6, 2) AS queue_ms_each,
  ROUND(SUM(queue_dur) * 100.0 / (SELECT SUM(dur) FROM slice WHERE track_id IN (SELECT track_id FROM mt) AND name='animation'), 1) AS pct_of_animation
FROM named GROUP BY buffer_queue ORDER BY swap_ms DESC;
-- Game frames by when they start in SurfaceFlinger's period (after its onMessageInvalidate), with
-- the wait inside the SurfaceView handoff. On the OnePlus 9 (Android 12), setTransactionState
-- holds a buffer queued early in the period until about 8.5 ms after the app's vsync, so a
-- frame that starts late (right after an overrunning one) waits there, ends late, and the next
-- one starts late too.
CREATE PERFETTO TABLE sf_commit AS SELECT s.ts FROM slice s JOIN thread_track tt ON s.track_id=tt.id JOIN thread t USING(utid)
  WHERE t.tid=(SELECT pid FROM process WHERE name='/system/bin/surfaceflinger') AND s.name LIKE 'onMessageInvalidate%';
CREATE PERFETTO TABLE gf AS SELECT f.ts, f.dur,
  f.ts - (SELECT MAX(c.ts) FROM sf_commit c WHERE c.ts <= f.ts) AS phase,
  (SELECT SUM(q.dur) FROM slice q WHERE q.track_id=f.track_id AND q.name='processNextBufferLocked' AND q.ts >= f.ts AND q.ts < f.ts + f.dur) AS wait
FROM slice f WHERE f.track_id IN (SELECT track_id FROM mt) AND f.name LIKE 'Choreographer#doFrame%' AND f.depth=0;
SELECT CASE WHEN phase > 6e6 THEN 'late (starts > 6 ms after SF)' ELSE 'on time' END AS frames,
  COUNT(*) AS n,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM gf WHERE phase IS NOT NULL), 1) AS pct,
  ROUND(AVG(dur) / 1e6, 1) AS frame_ms,
  ROUND(AVG(wait) / 1e6, 2) AS sf_wait_ms,
  ROUND(SUM(dur > 16.67e6) * 100.0 / COUNT(*), 1) AS pct_over_budget
FROM gf WHERE phase IS NOT NULL GROUP BY frames ORDER BY frames DESC;
