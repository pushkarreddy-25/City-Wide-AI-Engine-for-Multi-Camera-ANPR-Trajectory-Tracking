import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

/**
 * GlobalSearchModal Component
 * Provides a Ctrl+K global search overlay across plates, cameras, incidents, and system alerts.
 */
export default function GlobalSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim().toLowerCase();

    if (!q) {
      // Default quick navigation actions
      setResults([
        { type: 'Page', label: 'Control Room Overview', detail: 'Real-time vehicle map & active alert feed', link: '/' },
        { type: 'Page', label: 'Vehicles & Journeys', detail: 'Search plate histories and multi-camera trajectories', link: '/search' },
        { type: 'Page', label: 'Incident Dispatch Center', detail: 'Active traffic bottlenecks and emergency patrol units', link: '/incidents' },
        { type: 'Page', label: 'AI Model Router', detail: 'Cost-optimized multi-LLM surveillance prompt console', link: '/ai-models' },
        { type: 'Page', label: 'System Health & Telemetry', detail: 'Hardware metrics, stream latencies, and diagnostics', link: '/system-health' },
      ]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const matches = [];

      try {
        const [cams, vehicles, incidents] = await Promise.all([
          api.cameras().catch(() => []),
          api.search({ plate: q, limit: 4 }).catch(() => ({ results: [] })),
          api.incidents.list({ limit: 4 }).catch(() => []),
        ]);

        // 1. Camera matches
        (cams || []).forEach(c => {
          if (c.name?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q)) {
            matches.push({
              type: 'Camera',
              label: `${c.name || c.id}`,
              detail: `Speed limit: ${c.speed_limit_kmh || 50} km/h • ${c.lanes?.length || 3} lanes`,
              link: `/search?camera=${encodeURIComponent(c.id)}`
            });
          }
        });

        // 2. Vehicle plate matches
        const vList = vehicles?.results || vehicles?.vehicles || (Array.isArray(vehicles) ? vehicles : []);
        vList.forEach(v => {
          matches.push({
            type: 'Plate',
            label: v.plate || 'Vehicle Sighting',
            detail: `${v.vehicle_type || 'Vehicle'} • Speed: ${v.speed_kmh ?? '?'} km/h • ${v.camera_name || v.camera_id || 'Camera'}`,
            link: `/search?plate=${encodeURIComponent(v.plate || '')}`
          });
        });

        // 3. Incident matches
        (incidents || []).forEach(inc => {
          if (inc.title?.toLowerCase().includes(q) || inc.description?.toLowerCase().includes(q) || inc.status?.toLowerCase().includes(q)) {
            matches.push({
              type: 'Incident',
              label: inc.title || `Incident #${inc.id}`,
              detail: `Status: ${inc.status} • Severity: ${inc.severity} • Unit: ${inc.assigned_unit || 'Unassigned'}`,
              link: '/incidents'
            });
          }
        });

        // Fallback plate search link if query looks like a plate
        if (q.length >= 3 && !matches.some(m => m.type === 'Plate')) {
          matches.push({
            type: 'Plate Search',
            label: `Search journey for "${query.toUpperCase()}"`,
            detail: 'Execute deep trajectory reconstruction across all camera nodes',
            link: `/search?plate=${encodeURIComponent(query.toUpperCase())}`
          });
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setResults(matches);
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '80px',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        cursor: 'pointer'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          cursor: 'default',
          width: '100%',
          maxWidth: '600px',
          backgroundColor: 'var(--deck)',
          border: '1px solid var(--rule-hi)',
          borderRadius: 'var(--r-lg)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Search Input Header */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'var(--deck-2)',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '14px', color: 'var(--ink-mute)' }}>🔍</span>
          <input
            type="text"
            placeholder="Search plates, cameras, incidents, or alerts... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ink)',
              fontSize: '13.5px'
            }}
          />
          <button
            type="button"
            onClick={onClose}
            title="Press Esc or click to close"
            style={{
              fontSize: '11px',
              backgroundColor: 'var(--void)',
              color: 'var(--ink-mute)',
              padding: '3px 7px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--rule)',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ESC
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close modal"
            aria-label="Close"
            style={{
              fontSize: '15px',
              backgroundColor: 'transparent',
              color: 'var(--ink-mute)',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 'var(--r)',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Results */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '4px' }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px' }}>
              Searching across cameras, vehicle plates, and incidents...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: '13px' }}>
              No matches found for "{query}"
            </div>
          ) : (
            results.map((res, idx) => (
              <div
                key={idx}
                onClick={() => {
                  navigate(res.link);
                  onClose();
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--rule)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--void)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '13px' }}>
                    {res.label}
                  </div>
                  <div style={{ color: 'var(--ink-mute)', fontSize: '12px' }}>
                    {res.detail}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--cyan-wash)',
                  color: 'var(--cyan-soft)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r)',
                  fontWeight: 600
                }}>
                  {res.type}
                </span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
