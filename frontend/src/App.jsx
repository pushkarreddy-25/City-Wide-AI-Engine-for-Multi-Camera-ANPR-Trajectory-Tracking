import { useCallback, useEffect, useMemo, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Topbar } from "./components/Topbar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { ViolationModal } from "./components/ViolationModal.jsx";
import { useToast } from "./components/ToastHost.jsx";
import { useLiveSnapshot } from "./hooks/useLiveSnapshot.js";
import { api } from "./services/api.js";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Violations } from "./pages/Violations.jsx";
import { Search } from "./pages/Search.jsx";
import { Reports } from "./pages/Reports.jsx";
import { Settings } from "./pages/Settings.jsx";
import { Upload } from "./pages/Upload.jsx";

export function App() {
  const { push } = useToast();
  const [modalViolation, setModalViolation] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem("anpr-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("anpr-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const openModal = useCallback((v) => setModalViolation(v), []);
  const onNewAlert = useCallback((v) => push(v, openModal), [push, openModal]);

  const live = useLiveSnapshot(onNewAlert);
  const { status, snapshot, feed, patchViolation } = live;

  useEffect(() => {
    api.cameras().then(setCameras).catch(() => setCameras([]));
  }, []);

  const openViolations = useMemo(() => feed.filter((v) => !v.resolved).length, [feed]);

  const onResolved = useCallback((id, patch) => {
    patchViolation(id, patch);
    setModalViolation((cur) => (cur ? { ...cur, ...patch } : cur));
  }, [patchViolation]);

  return (
    <div className="app-shell">
      <Topbar status={status} stats={snapshot.stats} theme={theme} toggleTheme={toggleTheme} />
      <Sidebar openViolations={openViolations} />
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard cameras={cameras} snapshot={snapshot} feed={feed} openModal={openModal} />} />
          <Route path="/violations" element={<Violations openModal={openModal} />} />
          <Route path="/search" element={<Search />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/upload" element={<Upload cameras={cameras} />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {modalViolation && (
        <ViolationModal
          violation={modalViolation}
          onClose={() => setModalViolation(null)}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}
