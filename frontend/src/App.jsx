import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { PageWrapper } from "./components/PageWrapper.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { ViolationModal } from "./components/ViolationModal.jsx";
import { useToast } from "./components/ToastHost.jsx";
import { useLiveSnapshot } from "./hooks/useLiveSnapshot.js";
import { api } from "./services/api.js";

const Dashboard = lazy(() => import("./pages/Dashboard.jsx").then(m => ({ default: m.Dashboard })));
const Violations = lazy(() => import("./pages/Violations.jsx").then(m => ({ default: m.Violations })));
const Search = lazy(() => import("./pages/Search.jsx").then(m => ({ default: m.Search })));
const Reports = lazy(() => import("./pages/Reports.jsx").then(m => ({ default: m.Reports })));
const Settings = lazy(() => import("./pages/Settings.jsx").then(m => ({ default: m.Settings })));
const Upload = lazy(() => import("./pages/Upload.jsx").then(m => ({ default: m.Upload })));

export function App() {
  const location = useLocation();
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
        <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-mute)", minHeight: "100%" }}>Loading interface...</div>}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageWrapper><Dashboard cameras={cameras} snapshot={snapshot} feed={feed} openModal={openModal} /></PageWrapper>} />
              <Route path="/violations" element={<PageWrapper><Violations openModal={openModal} /></PageWrapper>} />
              <Route path="/search" element={<PageWrapper><Search /></PageWrapper>} />
              <Route path="/reports" element={<PageWrapper><Reports /></PageWrapper>} />
              <Route path="/upload" element={<PageWrapper><Upload cameras={cameras} /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </Suspense>
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
