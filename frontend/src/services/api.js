// Thin REST client for the ANPR backend. Paths are same-origin by default; in
// dev the Vite proxy forwards /api and /ws to the FastAPI server (see
// vite.config.js).
//
// On a static host (Vercel, Netlify, Pages) there is no backend to proxy to, so
// set VITE_API_BASE at build time to the origin the API actually runs on, e.g.
// `VITE_API_BASE=https://anpr.trycloudflare.com`. Left empty, everything stays
// same-origin and the bundled FastAPI deployment keeps working unchanged.
export const API_BASE = (import.meta.env?.VITE_API_BASE || "").replace(/\/+$/, "");

/** Absolute URL for a backend path, honouring API_BASE. */
export function apiUrl(path) {
  return API_BASE + path;
}

/** WebSocket URL for the live feed — ws:// or wss:// to match the API origin. */
export function wsUrl(path = "/ws/vehicles") {
  const base = API_BASE || location.origin;
  return base.replace(/^http/, "ws") + path;
}

async function req(path, opts) {
  const res = await fetch(apiUrl(path), opts);
  if (!res.ok) {
    const err = new Error(await detail(res));
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// Prefer the server's own explanation ({"detail": "..."}) over a status code.
async function detail(res) {
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") return body.detail;
  } catch {
    /* not JSON */
  }
  return `HTTP ${res.status}`;
}

/* When the backend runs with ANPR_API_KEY set, mutations need that key in an
   X-API-Key header. Held in sessionStorage so it dies with the tab and never
   reaches disk; setWriteKey lets a UI collect it after a 401. */
const KEY_STORE = "anpr.write_key";

export function writeKey() {
  try {
    return sessionStorage.getItem(KEY_STORE) || "";
  } catch {
    return "";
  }
}

export function setWriteKey(key) {
  try {
    if (key) sessionStorage.setItem(KEY_STORE, key);
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    /* storage blocked; the request simply goes out unauthenticated */
  }
}

function writeHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key = writeKey();
  if (key) headers["X-API-Key"] = key;
  return headers;
}

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  cameras: () => req("/api/cameras"),
  liveVehicles: (limit = 60) => req(`/api/vehicles/live${qs({ limit })}`),
  search: (params) => req(`/api/vehicles/search${qs(params)}`),
  journey: (plate, { date, dateFrom, dateTo, cameraId, vehicleType, color } = {}) =>
    req(`/api/vehicles/${encodeURIComponent(plate)}/journey${qs({
      date, date_from: dateFrom, date_to: dateTo, camera_id: cameraId,
      type: vehicleType, color,
    })}`),
  searchJourneys: (plate, { dateFrom, dateTo, cameraId, limit } = {}) =>
    req(`/api/vehicles/search-journeys${qs({
      plate, date_from: dateFrom, date_to: dateTo, camera_id: cameraId, limit,
    })}`),

  alerts: (params) => req(`/api/violations/alerts${qs(params)}`),
  uploadVideo: (cameraId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(apiUrl(`/api/cameras/${encodeURIComponent(cameraId)}/upload-video`), {
      method: "POST",
      body: fd,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Upload failed (HTTP ${res.status})`);
      }
      return res.json();
    });
  },
  resolveViolation: (id, notes) =>
    req(`/api/violations/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      headers: writeHeaders(),
      body: JSON.stringify({ notes: notes || "" }),
    }),

  congestion: (windowMinutes = 10) => req(`/api/congestion/heatmap${qs({ window_minutes: windowMinutes })}`),
  dailyVolume: (date) => req(`/api/reports/daily-volume${qs({ date })}`),
  violationsSummary: (hours = 24) => req(`/api/reports/violations-summary${qs({ hours })}`),
  speedSummary: (windowMinutes = 15) => req(`/api/reports/speed-summary${qs({ window_minutes: windowMinutes })}`),
  purgeOldData: () => req("/api/admin/purge-old-data", { method: "POST", headers: writeHeaders() }),
  stats: () => req("/api/stats"),
  health: () => req("/health"),
  diagnostics: () => req("/api/system/diagnostics"),
};

// Export links (opened directly by the browser, so they need the full URL)
export const exportUrls = {
  violationsCsv: (hours = 24) => apiUrl(`/api/violations/export.csv?hours=${hours}`),
  violationsPdf: (hours = 24) => apiUrl(`/api/violations/export.pdf?hours=${hours}`),
  dailyVolumeCsv: (date) => apiUrl(`/api/reports/daily-volume.csv${date ? `?date=${date}` : ""}`),
};
