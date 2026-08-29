import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl } from "../services/api.js";

/**
 * Subscribes to the backend WebSocket /ws/vehicles and exposes the latest
 * snapshot { vehicles, alerts, congestion, stats } plus a rolling, de-duplicated
 * violation feed. Auto-reconnects with a fixed backoff.
 *
 * @param {(v:object)=>void} onNewAlert  called once per newly-seen violation
 */
export function useLiveSnapshot(onNewAlert) {
  const [status, setStatus] = useState("connecting"); // connecting | live | down
  const [snapshot, setSnapshot] = useState({ vehicles: [], alerts: [], congestion: [], stats: {} });
  const [feed, setFeed] = useState([]); // rolling list of ViolationOut, newest first

  const feedMap = useRef(new Map());
  const seen = useRef(new Set());
  const started = useRef(false);
  const alertCb = useRef(onNewAlert);
  alertCb.current = onNewAlert;

  const ingest = useCallback((alerts) => {
    let changed = false;
    (alerts || []).forEach((v) => {
      if (!v || !v.violation_id) return;
      const isNew = !feedMap.current.has(v.violation_id);
      feedMap.current.set(v.violation_id, { ...feedMap.current.get(v.violation_id), ...v });
      if (isNew) {
        changed = true;
        if (started.current && !seen.current.has(v.violation_id)) {
          seen.current.add(v.violation_id);
          alertCb.current && alertCb.current(v);
        } else {
          seen.current.add(v.violation_id);
        }
      }
    });
    started.current = true;
    if (changed) {
      const list = Array.from(feedMap.current.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 60);
      setFeed(list);
    }
  }, []);

  // Allow optimistic local updates (e.g. after resolving a violation).
  const patchViolation = useCallback((id, patch) => {
    if (feedMap.current.has(id)) {
      feedMap.current.set(id, { ...feedMap.current.get(id), ...patch });
      setFeed(Array.from(feedMap.current.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 60));
    }
  }, []);

  useEffect(() => {
    let ws, reconnectT, closed = false;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl("/ws/vehicles"));
      } catch {
        scheduleReconnect();
        return;
      }
      setStatus("connecting");
      ws.onopen = () => setStatus("live");
      ws.onclose = () => {
        if (!closed) {
          setStatus("down");
          scheduleReconnect();
        }
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        setSnapshot({
          vehicles: Array.isArray(msg.vehicles) ? msg.vehicles : [],
          alerts: Array.isArray(msg.alerts) ? msg.alerts : [],
          congestion: Array.isArray(msg.congestion) ? msg.congestion : [],
          stats: msg.stats && typeof msg.stats === "object" ? msg.stats : {},
        });
        ingest(msg.alerts);
      };
    };
    const scheduleReconnect = () => {
      if (reconnectT || closed) return;
      reconnectT = setTimeout(() => { reconnectT = null; connect(); }, 2500);
    };

    connect();
    return () => { closed = true; clearTimeout(reconnectT); try { ws && ws.close(); } catch {} };
  }, [ingest]);

  return { status, snapshot, feed, patchViolation };
}
