// Presentation helpers shared across pages.

export const TYPE_LABEL = {
  red_light: "Red light",
  over_speed: "Over speed",
  speeding: "Over speed",
  wrong_lane: "Wrong lane",
};

export const TYPE_COLOR = {
  red_light: "#ff3b47",
  over_speed: "#ffb020",
  speeding: "#ffb020",
  wrong_lane: "#00e5d0",
};

/**
 * Only http(s) URLs may be used as an image source.
 *
 * Evidence URLs arrive from the API, and React does not vet `src` the way it
 * vets `href`, so a `javascript:`/`data:` URL would be passed straight through.
 * Returns "" for anything else, so the caller falls back to the placeholder.
 */
export function safeImageUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const u = new URL(raw, window.location.origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

export const prettyType = (t) =>
  TYPE_LABEL[t] ||
  String(t || "violation").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? String(ts) : d.toLocaleTimeString("en-GB", { hour12: false });
}

export function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d)
    ? String(ts)
    : d.toLocaleString("en-GB", {
        hour12: false, day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function detailLine(v) {
  if (!v) return "";
  if (v.type === "over_speed" || v.type === "speeding")
    return `${v.speed_kmh ?? "?"} km/h in a ${v.posted_limit ?? "?"} km/h zone`;
  if (v.type === "red_light") return "Crossed stop line on red signal";
  if (v.type === "wrong_lane") return "Vehicle in restricted lane";
  return "";
}

// Congestion index (0–100) + label from a set of congestion cells.
export function congestionIndex(cells) {
  if (!cells || !cells.length) return { index: null, level: "low", label: "calibrating" };
  const w = { low: 0.15, medium: 0.55, high: 1 };
  const index = Math.round((cells.reduce((a, c) => a + (w[c.level] ?? 0.15), 0) / cells.length) * 100);
  const level = index >= 66 ? "high" : index >= 33 ? "medium" : "low";
  const label = level === "high" ? "heavy" : level === "medium" ? "moderate" : "free-flowing";
  return { index, level, label };
}
