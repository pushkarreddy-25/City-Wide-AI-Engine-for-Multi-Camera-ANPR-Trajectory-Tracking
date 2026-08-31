/* ============================================================
   ANPR · Traffic Intelligence — dashboard client
   Talks to the FastAPI backend: WS /ws/vehicles for the live
   snapshot, REST for search / violations / reports / resolve.
   No build step, no framework — vanilla ES modules-free JS.
   ============================================================ */
(() => {
  "use strict";

  // ---- tiny DOM helpers ----------------------------------------------------
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /* Every value that reaches an innerHTML template goes through one of these.
     Plates, camera names and notes all originate outside this file — from OCR,
     from config, from another operator's typing — so none of them may be
     trusted to be inert markup. */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  /** Coerce to a finite number, for values interpolated into markup or CSS. */
  const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

  const LEVELS = new Set(["low", "medium", "high"]);
  /** Clamp a severity/congestion level to the three we style. */
  const level = (v) => (LEVELS.has(v) ? v : "low");

  const TYPE_LABEL = { red_light: "Red light", over_speed: "Over speed", wrong_lane: "Wrong lane", speeding: "Over speed" };
  const TYPE_COLOR = { red_light: "#ff3b47", over_speed: "#ffb020", wrong_lane: "#00e5d0", speeding: "#ffb020" };
  const CHART_INK = "#7f939f", CHART_GRID = "#18242f", CHART_ACCENT = "#00e5d0", CHART_BG = "#0a1017";
  const prettyType = (t) => TYPE_LABEL[t] || String(t || "violation").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  /** Only http(s) URLs may be used as an image source — never `javascript:`. */
  function safeImageUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return "";
    try {
      const u = new URL(raw, location.origin);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch { return ""; }
  }

  const fmtTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d)) return String(ts);
    return d.toLocaleTimeString("en-GB", { hour12: false });
  };
  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d)) return String(ts);
    return d.toLocaleString("en-GB", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  const todayISO = () => new Date().toISOString().slice(0, 10);

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) { const e = new Error(await errorDetail(res)); e.status = res.status; throw e; }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  /** Prefer the server's own explanation over a bare status code. */
  async function errorDetail(res) {
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") return body.detail;
    } catch { /* not JSON — fall through */ }
    return `HTTP ${res.status}`;
  }

  /* ---- write credential -----------------------------------------------------
     When the API is started with ANPR_API_KEY set (which the public-tunnel
     script does automatically), mutations need that key in an X-API-Key header.
     It is held in sessionStorage rather than localStorage so it disappears when
     the tab closes and never touches disk. */
  const KEY_STORE = "anpr.write_key";
  function writeKey() {
    try { const v = sessionStorage.getItem(KEY_STORE); if (v) return v; } catch { /* blocked */ }
    return state.writeKey || "";
  }
  function rememberKey(k) {
    state.writeKey = k;
    try { sessionStorage.setItem(KEY_STORE, k); } catch { /* blocked; in-memory only */ }
  }
  function forgetKey() {
    state.writeKey = "";
    try { sessionStorage.removeItem(KEY_STORE); } catch { /* blocked */ }
  }
  function writeHeaders() {
    const headers = { "Content-Type": "application/json" };
    const key = writeKey();
    if (key) headers["X-API-Key"] = key;
    return headers;
  }

  // ---- shared state --------------------------------------------------------
  const state = {
    cameras: [],
    camById: {},
    feed: new Map(),          // violation_id -> violation (dashboard live feed)
    seenAlerts: new Set(),    // ids we've already toasted
    charts: {},
    started: false,
    writeProtected: false,    // server wants a key before it accepts a write
    readOnly: false,          // server refuses every write
    writeKey: "",             // fallback when sessionStorage is unavailable
    map: null,
    camLayer: null,
  };

  /* ========================================================================
     Third-party library loading
     Chart.js loads from a CDN in index.html.
     ==================================================================== */

  /* ========================================================================
     View router
     ==================================================================== */
  function initNav() {
    $$(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => showView(btn.dataset.nav));
    });
  }
  function showView(name) {
    $$(".nav-item").forEach(b => b.setAttribute("aria-current", String(b.dataset.nav === name)));
    $$("[data-view-panel]").forEach(p => { p.hidden = (p.dataset.viewPanel !== name); });
    document.body.dataset.view = name;
    if (name === "violations") loadViolations();
    if (name === "reports") loadActiveReport();
    if (name === "upload") {
      const container = $("#upload-cameras-container");
      if (container && container.children.length === 0) {
        initUploadFeeds();
      }
    }
    if (name === "settings") loadSettingsDiagnostics();
  }

  /* ========================================================================
     Video Ingestion View
     ==================================================================== */
  function initUploadFeeds() {
    const container = $("#upload-cameras-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    // Default cameras list fallback if empty
    const cams = state.cameras.length > 0 ? state.cameras : [
      { id: "cam_1", name: "Sitabuldi Intersection", speed_limit_kmh: 50 },
      { id: "cam_2", name: "Dhantoli Intersection", speed_limit_kmh: 40 },
      { id: "cam_3", name: "Nagpur Square (Variety)", speed_limit_kmh: 50 },
      { id: "cam_4", name: "Ajni Square", speed_limit_kmh: 60 },
      { id: "cam_5", name: "Sadar Bazaar", speed_limit_kmh: 40 },
    ];

    cams.forEach(cam => {
      const panel = document.createElement("section");
      panel.className = "panel upload-panel";
      panel.style.padding = "16px";
      panel.innerHTML = `
        <div class="panel-head" style="border-bottom: 1px solid var(--rule); padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 class="eyebrow" style="font-size: 14px; font-weight: 600;">${cam.name}</h2>
            <span class="mono dim" style="font-size: 11px;">${cam.id.toUpperCase()} · Speed Limit: ${cam.speed_limit_kmh} km/h</span>
          </div>
          <span class="feed-count mono" style="background: rgba(0,229,208,.08); border-color: var(--cyan-dim); color: var(--cyan-soft); display: none;" id="cnt-${cam.id}">
            0 Detections
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap);">
          <!-- Upload Zone -->
          <div class="evidence upload-zone" id="zone-${cam.id}" style="min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed var(--rule-hi); border-radius: var(--r); background: var(--deck-2); padding: 20px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s;">
            <input type="file" accept="video/*" style="display: none;" id="file-${cam.id}" />
            <div class="zone-idle" id="idle-${cam.id}">
              <span style="font-size: 28px; color: var(--cyan);">⤓</span>
              <strong style="display: block; margin-top: 10px; color: var(--ink); font-size: 12px; text-transform: uppercase; letter-spacing: .08em;">Drag & Drop Video</strong>
              <span class="dim" style="font-size: 11.5px; margin-top: 4px;">or click to browse local traffic feed clips</span>
            </div>
            <div class="zone-loading" id="loading-${cam.id}" style="display: none; flex-direction: column; align-items: center;">
              <div class="spinner" style="width: 32px; height: 32px; border: 3px solid var(--rule-hi); border-top: 3px solid var(--cyan); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 12px;"></div>
              <strong style="color: var(--cyan-soft); font-size: 12px;" id="loading-msg-${cam.id}">Uploading & processing video...</strong>
              <span class="dim" style="font-size: 11px; margin-top: 4px;">Parsing frames, running ANPR & speed tracking...</span>
            </div>
            <div class="zone-success" id="success-${cam.id}" style="display: none; flex-direction: column; align-items: center;">
              <span style="font-size: 28px; color: var(--green);">✓</span>
              <strong style="display: block; margin-top: 10px; color: var(--green); font-size: 12px; text-transform: uppercase;">Processing Complete</strong>
              <span class="dim" style="font-size: 11.5px; margin-top: 4px;" id="success-msg-${cam.id}">Processed. Click to upload another clip.</span>
            </div>
            <div class="zone-error" id="error-${cam.id}" style="display: none; flex-direction: column; align-items: center;">
              <span style="font-size: 28px; color: var(--red);">⚠</span>
              <strong style="display: block; margin-top: 10px; color: var(--red); font-size: 12px; text-transform: uppercase;">Upload Failed</strong>
              <span style="font-size: 11.5px; margin-top: 4px; color: var(--red);" id="error-msg-${cam.id}">Error details</span>
            </div>
          </div>
          <!-- Results Zone -->
          <div style="display: flex; flex-direction: column; gap: 10px; min-height: 180px; background: rgba(10, 16, 23, 0.4); border-radius: var(--r); padding: 12px; border: 1px solid var(--rule);">
            <h3 class="eyebrow" style="font-size: 10.5px; color: var(--ink-mute); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px;">Detections & Analytics</h3>
            <div id="results-${cam.id}" style="flex: 1; overflow-y: auto; max-height: 220px; display: flex; flex-direction: column; gap: 6px;">
              <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); font-size: 12px; font-style: italic;">
                Upload video to view intelligence analytics...
              </div>
            </div>
          </div>
        </div>
      `;
      
      container.appendChild(panel);

      const zone = panel.querySelector(`#zone-${cam.id}`);
      const fileInput = panel.querySelector(`#file-${cam.id}`);
      
      zone.addEventListener("click", () => fileInput.click());
      
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        handleVideoUpload(cam, file);
      });
      
      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        handleVideoUpload(cam, file);
      });
    });
  }

  async function handleVideoUpload(cam, file) {
    if (!file) return;
    const camId = cam.id;
    
    const idleZone = document.getElementById(`idle-${camId}`);
    const loadingZone = document.getElementById(`loading-${camId}`);
    const successZone = document.getElementById(`success-${camId}`);
    const errorZone = document.getElementById(`error-${camId}`);
    const resultsContainer = document.getElementById(`results-${camId}`);
    const badge = document.getElementById(`cnt-${camId}`);

    const showZone = (zoneName) => {
      idleZone.style.display = zoneName === "idle" ? "flex" : "none";
      loadingZone.style.display = zoneName === "loading" ? "flex" : "none";
      successZone.style.display = zoneName === "success" ? "flex" : "none";
      errorZone.style.display = zoneName === "error" ? "flex" : "none";
    };

    if (!file.type.startsWith("video/")) {
      showZone("error");
      document.getElementById(`error-msg-${camId}`).textContent = "Invalid file type. Please upload a video.";
      return;
    }

    showZone("loading");
    resultsContainer.innerHTML = `<div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--cyan-soft); font-size: 12px; font-style: italic;">Processing feed in real-time...</div>`;

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(`/api/cameras/${encodeURIComponent(camId)}/upload-video`, {
        method: "POST",
        body: fd
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Upload failed (HTTP ${res.status})`);
      }
      
      const data = await res.json();
      
      showZone("success");
      document.getElementById(`success-msg-${camId}`).textContent = `Processed ${data.processed_frames} frames. Click to upload another clip.`;
      
      const detections = data.detections || [];
      const violations = data.violations || [];
      
      badge.textContent = `${detections.length} Detection${detections.length !== 1 ? 's' : ''}`;
      badge.style.display = "inline-block";

      if (detections.length === 0) {
        resultsContainer.innerHTML = `<div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-mute); font-size: 12px;">No vehicles detected in this clip.</div>`;
        return;
      }

      resultsContainer.innerHTML = "";
      
      detections.forEach(d => {
        const isSpeeder = d.speed_kmh > cam.speed_limit_kmh;
        const detRow = document.createElement("div");
        detRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; background: linear-gradient(180deg, rgba(15, 22, 29, .95), rgba(11, 17, 23, .9)); border: 1px solid var(--rule); border-radius: var(--r); font-size: 12px;";
        detRow.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <code class="plate-chip">${d.plate}</code>
            <span style="color: var(--ink-dim); font-size: 11px;">${d.vehicle_color} · ${d.vehicle_type}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="mono" style="font-weight: 600; color: ${isSpeeder ? 'var(--red)' : 'var(--cyan-soft)'}">
              ${d.speed_kmh ? `${Math.round(d.speed_kmh)} km/h` : "—"}
            </span>
            ${isSpeeder ? `
              <span style="font-size: 9px; background: rgba(255,59,71,.12); border: 1px solid rgba(255,59,71,.4); color: var(--red); padding: 1px 4px; border-radius: 2px; font-weight: 700;">SPEEDING</span>
            ` : ""}
          </div>
        `;
        resultsContainer.appendChild(detRow);
      });

      if (violations.length > 0) {
        const violDivider = document.createElement("div");
        violDivider.style.cssText = "margin-top: 8px; border-top: 1px solid var(--rule); padding-top: 8px;";
        violDivider.innerHTML = `<h4 class="eyebrow" style="font-size: 9.5px; color: var(--red); margin-bottom: 4px;">Generated Violations</h4>`;
        
        const violList = document.createElement("div");
        violList.style.cssText = "display: flex; flex-direction: column; gap: 4px;";
        
        violations.forEach(v => {
          const vRow = document.createElement("div");
          vRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: rgba(255, 59, 71, 0.05); border: 1px solid rgba(255, 59, 71, 0.2); border-radius: var(--r); font-size: 11px;";
          
          let prettyType = v.type;
          if (prettyType === "speed") prettyType = "Speeding";
          else if (prettyType === "red_light") prettyType = "Red Light";
          else if (prettyType === "lane") prettyType = "Lane Misuse";

          vRow.innerHTML = `
            <span style="color: var(--red); font-weight: 600;">⚠ ${prettyType}</span>
            <span class="mono" style="color: var(--ink);">${v.plate}</span>
          `;
          violList.appendChild(vRow);
        });
        
        violDivider.appendChild(violList);
        resultsContainer.appendChild(violDivider);
      }

    } catch (err) {
      showZone("error");
      document.getElementById(`error-msg-${camId}`).textContent = err.message || "Failed to process video.";
    }
  }

  /* ========================================================================
     Live WebSocket
     ==================================================================== */
  function setConn(stateName, label) {
    const c = $("#conn"); if (!c) return;
    c.dataset.state = stateName; $("#conn-label").textContent = label;
  }

  function connectWS() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws/vehicles`;
    let ws;
    try { ws = new WebSocket(url); } catch { scheduleReconnect(); return; }
    setConn("connecting", "connecting");

    ws.onopen = () => setConn("live", "live");
    ws.onclose = () => { setConn("down", "reconnecting"); scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      handleSnapshot(msg);
    };
  }
  let reconnectT = null;
  function scheduleReconnect() {
    if (reconnectT) return;
    reconnectT = setTimeout(() => { reconnectT = null; connectWS(); }, 2500);
  }

  function handleSnapshot(msg) {
    const vehicles = msg.vehicles || [];
    const alerts = msg.alerts || [];
    const congestion = msg.congestion || [];
    const stats = msg.stats || {};

    // header
    if (stats.sim_time != null) $("#sim-clock").textContent = fmtTime(stats.sim_time);
    if (stats.fleet_size != null) $("#fleet-size").textContent = stats.fleet_size;

    // stat cards
    setStat("#stat-vehicles", stats.active_vehicles ?? vehicles.length);
    updateSpeedStat(stats, vehicles);
    updateCongestionStat(congestion);

    // live map
    syncCameraDensity(vehicles);

    // violations feed
    ingestAlerts(alerts);
  }

  function hasLeaflet() { return typeof window !== "undefined" && !!window.L && !!document.getElementById("map"); }

  function initMap() {
    if (!hasLeaflet()) return false;
    if (state.map) return true;
    state.map = L.map("map", { zoomControl: true, attributionControl: true }).setView([21.1458, 79.0882], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(state.map);
    state.camLayer = L.layerGroup().addTo(state.map);
    return true;
  }

  function cameraDensityColor(count) {
    if (count >= 12) return "#ef4444";
    if (count >= 8) return "#f97316";
    if (count >= 4) return "#fbbf24";
    if (count >= 1) return "#2dd4bf";
    return "#94a3b8";
  }

  function cameraDensityRadius(count) {
    if (!count) return 8;
    return Math.min(22, 10 + count * 2.4);
  }

  function syncCameraDensity(vehicles) {
    if (!state.cameras.length) return;
    if (!initMap()) return;

    const counts = new Map();
    (vehicles || []).forEach(v => {
      const cameraId = v && (v.camera_id || v.cameraId);
      if (!cameraId) return;
      counts.set(cameraId, (counts.get(cameraId) || 0) + 1);
    });

    const nodes = [];
    state.cameras.forEach(cam => {
      const id = cam.id || cam.camera_id;
      const pos = cam.position || {};
      const lat = Number(pos.lat), lng = Number(pos.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const count = counts.get(id) || 0;
      nodes.push({ id, name: cam.name || id, lat, lng, count });
    });

    if (!nodes.length) return;

    if (state.camLayer) state.camLayer.clearLayers();
    nodes.forEach(node => {
      const marker = L.circleMarker([node.lat, node.lng], {
        radius: cameraDensityRadius(node.count),
        color: cameraDensityColor(node.count),
        fillColor: cameraDensityColor(node.count),
        fillOpacity: node.count ? 0.72 : 0.28,
        weight: 1.8,
      });
      marker.bindPopup(`<div class="map-popup"><div class="map-popup-title">${esc(node.name)}</div><div class="map-popup-row"><span>Vehicle density</span><strong>${node.count}</strong></div><div class="map-popup-row"> <span>Level</span><strong>${node.count >= 9 ? "high" : node.count >= 5 ? "medium" : node.count > 0 ? "low" : "idle"}</strong></div></div>`);
      marker.addTo(state.camLayer);
    });

    const bounds = L.latLngBounds(nodes.map(node => [node.lat, node.lng]));
    if (state.map && nodes.length) state.map.fitBounds(bounds, { padding: [25, 25], maxZoom: 13 });
    $("#camera-density-count").textContent = String(nodes.reduce((sum, node) => sum + node.count, 0));
  }

  function setStat(sel, val) {
    const num = $(`${sel} .stat-num`); if (!num) return;
    const next = String(val);
    if (num.textContent !== next) { num.textContent = next; num.classList.remove("flash"); void num.offsetWidth; num.classList.add("flash"); }
  }

  function updateSpeedStat(stats, vehicles) {
    let avg = stats?.avg_city_speed;
    if (avg == null || typeof avg !== "number") {
      const speeds = (vehicles || []).map(v => v.speed_kmh).filter(s => typeof s === "number");
      avg = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : "—";
    } else {
      avg = Math.round(avg);
    }
    setStat("#stat-speed", avg);
  }

  function updateCongestionStat(cells) {
    if (!cells.length) return;
    const w = { low: 0.15, medium: 0.55, high: 1 };
    const idx = Math.round((cells.reduce((a, c) => a + (w[c.level] ?? 0.15), 0) / cells.length) * 100);
    setStat("#stat-congestion", idx);
    const band = idx >= 66 ? "high" : idx >= 33 ? "medium" : "low";
    const label = band === "high" ? "heavy" : band === "medium" ? "moderate" : "free-flowing";
    const pill = $("#stat-congestion .pill");
    if (pill) { pill.dataset.level = band; pill.textContent = label; }
  }

  /* ========================================================================
     Live violation feed + toasts
     ==================================================================== */
  function ingestAlerts(alerts) {
    let fresh = 0;
    alerts.forEach(v => {
      if (!v || !v.violation_id) return;
      const isNew = !state.feed.has(v.violation_id);
      state.feed.set(v.violation_id, v);
      if (isNew && !state.seenAlerts.has(v.violation_id)) {
        state.seenAlerts.add(v.violation_id);
        if (state.started) { toast(v); fresh++; }
      }
    });
    state.started = true;
    if (fresh || alerts.length) renderFeed();
  }

  function renderFeed() {
    const list = $("#feed"); if (!list) return;
    const items = Array.from(state.feed.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 40);

    const openUnresolved = items.filter(v => !v.resolved);
    setStat("#stat-violations", openUnresolved.length);
    const high = openUnresolved.filter(v => v.severity === "high").length;
    const hi = $("#stat-violations .sev-high"); if (hi) hi.textContent = `${high} high`;
    const badge = $("#nav-viol-count");
    if (badge) { badge.hidden = openUnresolved.length === 0; badge.textContent = openUnresolved.length; }
    $("#feed-count").textContent = openUnresolved.length;

    if (!items.length) { list.innerHTML = `<li class="feed-empty">Waiting for the engine to surface violations…</li>`; return; }
    list.innerHTML = "";
    items.forEach(v => {
      const li = el("li", "feed-item");
      li.dataset.sev = level(v.severity);
      li.innerHTML = `
        <div class="feed-top">
          <span class="feed-type">${esc(prettyType(v.type))}</span>
          <span class="feed-time">${esc(fmtTime(v.timestamp))}</span>
        </div>
        <div class="feed-mid">
          <span class="plate ${v.plate ? "" : "low"}">${esc(v.plate || "UNREAD")}</span>
          <span class="sev ${level(v.severity)}">${level(v.severity)}</span>
        </div>
        <div class="feed-cam">${esc(v.camera_name || v.camera_id || "")}</div>`;
      li.addEventListener("click", () => openModal(v));
      list.appendChild(li);
    });
  }

  const toastStack = () => $("#toasts");
  function toast(v) {
    const t = el("div", "toast");
    t.dataset.sev = level(v.severity);
    t.innerHTML = `<div class="toast-title"><span class="sev ${level(v.severity)}">${level(v.severity)}</span>${esc(prettyType(v.type))}</div>
      <div class="toast-body"><span class="plate">${esc(v.plate || "UNREAD")}</span> · ${esc(v.camera_name || v.camera_id || "")}</div>`;
    t.addEventListener("click", () => { openModal(v); dismiss(t); });
    toastStack().appendChild(t);
    const timer = setTimeout(() => dismiss(t), 8000);
    function dismiss(node) { clearTimeout(timer); node.classList.add("out"); setTimeout(() => node.remove(), 300); }
    // keep at most 4 toasts
    while (toastStack().children.length > 4) toastStack().firstChild.remove();
  }

  /* ========================================================================
     Violation detail modal + resolve
     ==================================================================== */
  function openModal(v) {
    const body = $("#modal-body");
    const detail = detailLine(v);
    const evidence = safeImageUrl(v.evidence_image_url);
    const confidence = (v.confidence != null && Number.isFinite(Number(v.confidence)))
      ? Math.round(Number(v.confidence) * 100) + "%" : "—";
    body.innerHTML = `
      <dl class="detail-grid">
        <dt>Type</dt><dd>${esc(prettyType(v.type))}</dd>
        <dt>Plate</dt><dd><span class="plate">${esc(v.plate || "UNREAD")}</span></dd>
        <dt>Camera</dt><dd>${esc(v.camera_name || v.camera_id || "—")}</dd>
        <dt>Time</dt><dd class="mono">${esc(fmtDateTime(v.timestamp))}</dd>
        <dt>Severity</dt><dd><span class="sev ${level(v.severity)}">${level(v.severity)}</span></dd>
        ${detail ? `<dt>Detail</dt><dd>${esc(detail)}</dd>` : ""}
        <dt>Confidence</dt><dd class="mono">${confidence}</dd>
        <dt>Status</dt><dd>${v.resolved ? '<span class="resolved-tag">✓ Resolved</span>' : "Open"}</dd>
      </dl>
      <div class="evidence" id="evidence-box">${evidence ? ""
        : "◎ Evidence frame captured at detection<br>(image pipeline stub in simulation mode)"}</div>
      ${v.resolved
        ? (v.notes ? `<p class="dim">Notes: ${esc(v.notes)}</p>` : "")
        : state.readOnly
          ? `<p class="modal-note warn">This deployment is read-only — violations cannot be resolved from here.</p>`
          : `<input class="notes-input" id="resolve-notes" maxlength="500" placeholder="Resolution notes (optional)…" />
             ${state.writeProtected && !writeKey()
               ? `<input class="notes-input" id="resolve-key" type="password" autocomplete="off" placeholder="Operator API key" />`
               : ""}
             <div class="modal-actions">
               <button class="btn" id="modal-cancel">Cancel</button>
               <button class="btn btn-primary" id="modal-resolve">Mark resolved</button>
             </div>
             <p class="modal-note" id="resolve-note" hidden></p>`}`;
    if (evidence) mountEvidence($("#evidence-box"), evidence);
    if (!v.resolved && !state.readOnly) {
      $("#modal-cancel").addEventListener("click", closeModal);
      $("#modal-resolve").addEventListener("click", () => resolveViolation(v));
    }
    $("#modal").hidden = false;
  }
  function closeModal() { $("#modal").hidden = true; }

  /** Attach the evidence frame via the DOM so the error handler needs no
      inline `onerror` — that would have forced 'unsafe-inline' into script-src. */
  function mountEvidence(box, url) {
    if (!box) return;
    const img = document.createElement("img");
    img.alt = "Violation evidence frame";
    img.addEventListener("error", () => { box.textContent = "Evidence frame unavailable"; });
    img.src = url;   // set last, so the listener is already in place
    box.appendChild(img);
  }

  /** Reveal a key field after the server has told us one is required. */
  function ensureKeyField() {
    const existing = $("#resolve-key");
    if (existing) return existing;
    const notes = $("#resolve-notes");
    if (!notes) return null;
    const input = el("input", "notes-input");
    input.id = "resolve-key";
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = "Operator API key";
    notes.insertAdjacentElement("afterend", input);
    return input;
  }

  function resolveNote(text, warn) {
    const note = $("#resolve-note");
    if (!note) return;
    note.textContent = text;
    note.className = warn ? "modal-note warn" : "modal-note";
    note.hidden = !text;
  }

  function detailLine(v) {
    if (v.type === "over_speed" || v.type === "speeding")
      return `${v.speed_kmh ?? "?"} km/h in a ${v.posted_limit ?? "?"} km/h zone`;
    if (v.type === "red_light") return "Crossed stop line on red signal";
    if (v.type === "wrong_lane") return "Vehicle in restricted lane";
    return "";
  }

  async function resolveViolation(v) {
    const notes = $("#resolve-notes")?.value || "";
    const typedKey = ($("#resolve-key")?.value || "").trim();
    if (typedKey) rememberKey(typedKey);
    const btn = $("#modal-resolve"); if (btn) { btn.disabled = true; btn.textContent = "Resolving…"; }
    resolveNote("");
    try {
      const updated = await api(`/api/violations/${encodeURIComponent(v.violation_id)}/resolve`, {
        method: "POST", headers: writeHeaders(), body: JSON.stringify({ notes }),
      });
      if (state.feed.has(v.violation_id)) state.feed.set(v.violation_id, { ...v, ...updated, resolved: true, notes });
      renderFeed();
      closeModal();
      if (!$("[data-view-panel='violations']").hidden) loadViolations();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Retry"; }
      if (e.status === 401) {
        // The key was missing or wrong — drop it and ask again rather than
        // silently retrying with a credential the server has rejected.
        forgetKey();
        state.writeProtected = true;
        const field = ensureKeyField();
        if (field) { field.value = ""; field.focus(); }
        resolveNote("This server requires an operator API key (ANPR_API_KEY). Enter it and retry.", true);
      } else if (e.status === 403) {
        resolveNote("This deployment is read-only, so the violation cannot be resolved here.", true);
      } else {
        resolveNote(`Could not resolve the violation: ${e.message}`, true);
      }
    }
  }

  /* ========================================================================
     Violations view (full history + filters)
     ==================================================================== */
  async function loadViolations() {
    const tbody = $("#viol-rows");
    tbody.innerHTML = `<tr><td colspan="8" class="tbl-empty">Loading…</td></tr>`;
    const type = $("#f-type").value, sev = $("#f-severity").value, resolved = $("#f-resolved").value;
    const p = new URLSearchParams({ limit: "150" });
    if (type) p.set("type", type);
    if (sev) p.set("severity", sev);
    if (resolved) p.set("resolved", resolved);
    // keep export links in sync with the type filter
    try {
      const data = await api(`/api/violations/alerts?${p}`);
      const rows = data.alerts || [];
      if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8" class="tbl-empty">No violations match these filters.</td></tr>`; return; }
      tbody.innerHTML = "";
      rows.forEach(v => {
        const tr = el("tr");
        tr.innerHTML = `
          <td class="time-cell">${esc(fmtDateTime(v.timestamp))}</td>
          <td>${esc(prettyType(v.type))}</td>
          <td><span class="plate ${v.plate ? "" : "low"}">${esc(v.plate || "UNREAD")}</span></td>
          <td>${esc(v.camera_name || v.camera_id || "—")}</td>
          <td class="dim">${esc(detailLine(v) || "—")}</td>
          <td><span class="sev ${level(v.severity)}">${level(v.severity)}</span></td>
          <td>${v.resolved ? '<span class="resolved-tag">✓ Resolved</span>' : "Open"}</td>
          <td></td>`;
        const act = el("button", "btn btn-sm", v.resolved ? "View" : "Resolve");
        act.addEventListener("click", () => openModal(v));
        tr.lastElementChild.appendChild(act);
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" class="tbl-empty">Failed to load violations (${esc(e.message)}).</td></tr>`;
    }
  }

  function initViolations() {
    $("#f-refresh").addEventListener("click", loadViolations);
    ["#f-type", "#f-severity", "#f-resolved"].forEach(s => $(s).addEventListener("change", loadViolations));
  }

  /* ========================================================================
     Search vehicle journey
     ==================================================================== */
  function initSearch() {
    $("#s-date").value = todayISO();
    $("#search-form").addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
  }

  /** Mirrors the server-side pattern so a bad plate gets a sentence, not a 422. */
  const PLATE_OK = /^[A-Za-z0-9][A-Za-z0-9 \-]{1,19}$/;

  async function runSearch() {
    const plate = $("#s-plate").value.trim();
    const date = $("#s-date").value;
    const msg = $("#search-msg"), grid = $("#journey-grid");
    if (!plate) { msg.hidden = false; msg.textContent = "Enter a license plate to search."; grid.hidden = true; return; }
    if (!PLATE_OK.test(plate)) {
      msg.hidden = false; grid.hidden = true;
      msg.textContent = "Use 2–20 characters: letters, digits, spaces or hyphens (e.g. MH-31-AB-1234).";
      return;
    }
    msg.hidden = false; msg.textContent = "Searching…"; grid.hidden = true;
    const p = new URLSearchParams(); if (date) p.set("date", date);
    try {
      const traj = await api(`/api/vehicles/${encodeURIComponent(plate)}/journey?${p}`);
      renderJourney(traj);
      msg.hidden = true;
    } catch (e) {
      grid.hidden = true; msg.hidden = false;
      msg.textContent = e.status === 404
        ? `No journey found for ${plate}${date ? " on " + date : ""}.`
        : `Search failed (${e.message}).`;
    }
  }

  /* ========================================================================
     Journey Leaflet map
     ==================================================================== */
  let jmap = null;
  let jLayer = null;

  function initJourneyMap() {
    if (jmap) return;
    const container = $("#journey-map");
    if (!container) return;
    jmap = L.map("journey-map", {
      center: [19.15, 72.95],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(jmap);
    jLayer = L.layerGroup().addTo(jmap);
  }

  function renderJourney(traj) {
    const grid = $("#journey-grid");
    const msg = $("#search-msg");
    const sightings = $("#sightings");
    const sightings_data = traj.sightings || [];

    if (!sightings_data.length) {
      if (grid) grid.hidden = true;
      if (msg) { msg.hidden = false; msg.textContent = `No journey found for ${traj.plate_number || ""} on this date.`; }
      return;
    }

    initJourneyMap();

    const plateEl = $("#j-plate");
    const countEl = $("#j-count");
    if (plateEl) plateEl.textContent = traj.plate_number || "";
    if (countEl) countEl.textContent = `${sightings_data.length} stops`;

    if (jLayer) jLayer.clearLayers();

    const sorted = [...sightings_data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const coords = [];

    // Draw path through all camera positions in order
    sorted.forEach(s => {
      const cam = state.camById[s.camera_id];
      if (!cam) return;
      const pos = cam.position || {};
      const lat = Number(pos.lat), lng = Number(pos.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      coords.push([lat, lng]);
    });

    if (coords.length > 1) {
      L.polyline(coords, {
        color: "#2dd4bf",
        weight: 3,
        opacity: 0.8,
        dashArray: "7 4",
      }).addTo(jLayer);
    }

    // Numbered markers for each sighting
    sorted.forEach((s, i) => {
      const cam = state.camById[s.camera_id];
      if (!cam) return;
      const pos = cam.position || {};
      const lat = Number(pos.lat), lng = Number(pos.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const popup = `
        <div class="jm-popup">
          <div class="jm-title">${esc(s.camera_id || "?")}</div>
          <div class="jm-row"><span>Stop</span><strong>${i + 1} / ${sorted.length}</strong></div>
          <div class="jm-row"><span>Time</span><strong>${esc(fmtDateTime(s.timestamp))}</strong></div>
          ${s.lane ? `<div class="jm-row"><span>Lane</span><strong>${esc(s.lane)}</strong></div>` : ""}
          ${s.direction ? `<div class="jm-dir">${esc(s.direction)}</div>` : ""}
        </div>`;

      L.circleMarker([lat, lng], {
        radius: 9,
        color: "#2dd4bf",
        fillColor: "#0f172a",
        fillOpacity: 0.92,
        weight: 2.5,
      }).bindPopup(popup).addTo(jLayer);
    });

    if (coords.length > 0) {
      jmap.fitBounds(L.latLngBounds(coords), { padding: [35, 35], maxZoom: 14 });
    }

    // Render sightings list
    sightings.innerHTML = "";
    sorted.forEach((s, i) => {
      const li = el("li", "sighting");
      li.innerHTML = `
        <div class="sighting-cam">${esc(s.camera_id || "?")}</div>
        <div class="sighting-meta">${esc(fmtDateTime(s.timestamp))} &middot; ${esc(s.lane || "")}</div>
        ${s.direction ? `<div class="sighting-dir">${esc(s.direction)}</div>` : ""}`;
      sightings.appendChild(li);
    });

    if (grid) grid.hidden = false;
    if (msg) msg.hidden = true;
  }

  /* ========================================================================
     Reports
     ==================================================================== */
  function initReports() {
    $("#r-date").value = todayISO();
    $$(".tab").forEach(t => t.addEventListener("click", () => selectTab(t.dataset.tab)));
    $("#r-volume-go").addEventListener("click", loadVolume);
    $("#r-viol-go").addEventListener("click", loadViolSummary);
    $("#r-cong-go").addEventListener("click", loadCongestionReport);
    // keep the CSV link in step with the chosen date
    $("#r-date").addEventListener("change", () => {
      $("#dl-volume-csv").href = `/api/reports/daily-volume.csv?date=${$("#r-date").value}`;
    });
    $("#dl-volume-csv").href = `/api/reports/daily-volume.csv?date=${$("#r-date").value}`;
  }
  function selectTab(name) {
    $$(".tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    $$("[data-tab-panel]").forEach(p => { p.hidden = p.dataset.tabPanel !== name; });
    loadActiveReport();
  }
  function activeTab() { return ($(".tab[aria-selected='true']") || {}).dataset?.tab || "volume"; }
  function loadActiveReport() {
    const t = activeTab();
    if (t === "volume" && !state.charts.hour) loadVolume();
    else if (t === "viol" && !state.charts.type) loadViolSummary();
    else if (t === "cong") loadCongestionReport();
  }

  const chartFont = () => {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = CHART_INK;
    Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.borderColor = CHART_GRID;
  };

  async function loadVolume() {
    const date = $("#r-date").value || todayISO();
    try {
      const d = await api(`/api/reports/daily-volume?date=${date}`);
      $("#volume-summary").innerHTML = `
        ${kpi("Total vehicles", d.total ?? 0)}
        ${kpi("Peak hour", d.peak_hour != null ? String(d.peak_hour).padStart(2, "0") + ":00" : "—")}
        ${kpi("Cameras", (d.by_camera || []).length)}`;
      drawBar("chart-hour", "hour",
        (d.by_hour || []).map(h => String(h.hour).padStart(2, "0")),
        (d.by_hour || []).map(h => num(h.count)), CHART_ACCENT);
      fillCameraTable("#volume-cameras", d.by_camera || []);
    } catch (e) { $("#volume-summary").innerHTML = `<p class="search-msg">Could not load daily volume (${esc(e.message)}).</p>`; }
  }

  async function loadViolSummary() {
    const hours = $("#r-viol-hours").value || "24";
    try {
      const d = await api(`/api/reports/violations-summary?hours=${hours}`);
      const sev = d.by_severity || {};
      $("#viol-summary").innerHTML = `
        ${kpi("Total violations", d.total ?? 0)}
        ${kpi("High severity", sev.high ?? 0)}
        ${kpi("Types", Object.keys(d.by_type || {}).length)}`;
      const types = Object.keys(d.by_type || {});
      drawDoughnut("chart-type", types.map(prettyType), types.map(t => num(d.by_type[t])), types.map(t => TYPE_COLOR[t] || CHART_ACCENT));
      fillCameraTable("#viol-cameras", d.by_camera || []);
    } catch (e) { $("#viol-summary").innerHTML = `<p class="search-msg">Could not load violation summary (${esc(e.message)}).</p>`; }
  }

  async function loadCongestionReport() {
    const mins = $("#r-cong-mins").value || "10";
    const wrap = $("#cong-cards");
    wrap.innerHTML = `<p class="dim">Loading…</p>`;
    try {
      const cells = await api(`/api/congestion/heatmap?window_minutes=${mins}`);
      if (!cells.length) { wrap.innerHTML = `<p class="dim">No congestion data in this window.</p>`; return; }
      wrap.innerHTML = "";
      cells.sort((a, b) => num(b.vehicle_count) - num(a.vehicle_count)).forEach(c => {
        const card = el("div", "cong-card"); card.dataset.level = level(c.level);
        card.innerHTML = `<div class="cong-name">${esc(c.camera_name || c.camera_id)}</div>
          <div class="cong-count">${num(c.vehicle_count)} <small>vehicles · ${level(c.level)}</small></div>`;
        wrap.appendChild(card);
      });
    } catch (e) { wrap.innerHTML = `<p class="dim">Could not load congestion (${esc(e.message)}).</p>`; }
  }

  function kpi(label, val) { return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-val">${esc(val)}</div></div>`; }

  function fillCameraTable(sel, rows) {
    const tbody = $(sel); tbody.innerHTML = "";
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="2" class="tbl-empty">No data</td></tr>`; return; }
    const max = Math.max(...rows.map(r => num(r.count)), 1);
    rows.forEach(r => {
      const tr = el("tr");
      const count = num(r.count);
      tr.innerHTML = `<td>${esc(r.camera_name || r.camera_id)}</td>
        <td class="ta-r bar-cell"><span class="bar" style="width:${(count / max * 100).toFixed(0)}%"></span><span class="mono">${count}</span></td>`;
      tbody.appendChild(tr);
    });
  }

  function drawBar(canvasId, key, labels, data, color) {
    if (typeof Chart === "undefined") return;
    if (state.charts[key]) state.charts[key].destroy();
    state.charts[key] = new Chart($("#" + canvasId), {
      type: "bar",
      data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 2, maxBarThickness: 22 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: CHART_GRID } } } },
    });
  }

  function drawDoughnut(canvasId, labels, data, colors) {
    if (typeof Chart === "undefined") return;
    if (state.charts.type) state.charts.type.destroy();
    if (!labels.length) { const ctx = $("#" + canvasId).getContext("2d"); ctx.clearRect(0, 0, 9999, 9999); return; }
    state.charts.type = new Chart($("#" + canvasId), {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: CHART_BG, borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "64%",
        plugins: { legend: { position: "bottom", labels: { padding: 16, usePointStyle: true } } } },
    });
  }

  /* ========================================================================
     Settings & Diagnostics
     ==================================================================== */
  async function loadSettingsDiagnostics() {
    try {
      const diag = await api("/api/system/diagnostics");
      if (diag && diag.counts) {
        $("#diag-cnt-detections").textContent = (diag.counts.detections ?? 0).toLocaleString();
        $("#diag-cnt-trajectories").textContent = (diag.counts.trajectories ?? 0).toLocaleString();
        $("#diag-cnt-violations").textContent = (diag.counts.violations ?? 0).toLocaleString();
        $("#diag-cnt-cameras").textContent = String(diag.counts.cameras ?? state.cameras.length);
      }
    } catch { /* non-fatal */ }
  }

  function initSettings() {
    const refBtn = $("#diag-refresh-btn");
    if (refBtn) refBtn.addEventListener("click", loadSettingsDiagnostics);

    const purgeBtn = $("#diag-purge-btn");
    const msgEl = $("#diag-msg");
    if (purgeBtn) {
      purgeBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to purge expired traffic data?")) return;
        purgeBtn.disabled = true;
        purgeBtn.textContent = "Purging…";
        if (msgEl) msgEl.hidden = true;
        try {
          const res = await api("/api/admin/purge-old-data", { method: "POST", headers: writeHeaders() });
          if (msgEl) {
            msgEl.hidden = false;
            msgEl.textContent = `Purged ${res.detections_deleted ?? 0} detections, ${res.trajectories_deleted ?? 0} trajectories, ${res.violations_deleted ?? 0} violations.`;
          }
          await loadSettingsDiagnostics();
        } catch (e) {
          alert(`Failed to purge old data: ${e.message}`);
        } finally {
          purgeBtn.disabled = false;
          purgeBtn.textContent = "Purge Expired Records";
        }
      });
    }
  }

  /* ========================================================================
     Boot
     ==================================================================== */
  async function warmStart() {
    // seed the feed & congestion so the dashboard isn't blank before the first tick
    try {
      const [alerts, cong, stats] = await Promise.all([
        api(`/api/violations/alerts?limit=30`).catch(() => ({ alerts: [] })),
        api(`/api/congestion/heatmap?window_minutes=10`).catch(() => []),
        api(`/api/stats`).catch(() => ({})),
      ]);
      (alerts.alerts || []).forEach(v => { if (v.violation_id) { state.feed.set(v.violation_id, v); state.seenAlerts.add(v.violation_id); } });
      renderFeed();
      updateCongestion(cong);
      updateCongestionStat(cong);
      if (stats && typeof stats === "object") {
        if (stats.active_vehicles != null) setStat("#stat-vehicles", stats.active_vehicles);
        if (stats.avg_city_speed != null) setStat("#stat-speed", Math.round(stats.avg_city_speed));
      }
    } catch { /* non-fatal */ }
  }

  async function boot() {
    initNav(); initViolations(); initSearch(); initReports(); initSettings();

    // Chart.js library is loaded from CDN in index.html
    const hasChart = typeof Chart !== "undefined";
    if (hasChart) chartFont();
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    try {
      state.cameras = await api("/api/cameras");
      state.cameras.forEach(c => state.camById[c.id] = c);
    } catch { state.cameras = []; }

    // Learn the server's write posture so the resolve dialog can ask for a key
    // up front rather than failing on submit. The server enforces this either
    // way — this only shapes the prompt.
    try {
      const health = await api("/health");
      state.writeProtected = !!health.write_protected;
      state.readOnly = !!health.read_only;
    } catch { /* non-fatal */ }

    await warmStart();
    connectWS();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
