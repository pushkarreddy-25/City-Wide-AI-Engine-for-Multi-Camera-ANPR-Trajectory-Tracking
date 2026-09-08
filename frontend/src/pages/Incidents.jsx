import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

/**
 * Incidents Component
 * Traffic incident workflow manager & dispatch control center.
 */
export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const fetchIncidents = async () => {
    try {
      const data = await api.incidents.list();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await api.incidents.update(id, { status: newStatus });
      fetchIncidents();
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };


  const filteredIncidents = incidents.filter(inc => {
    if (filterSeverity !== 'ALL' && inc.severity.toUpperCase() !== filterSeverity) return false;
    if (filterStatus !== 'ALL' && inc.status.toUpperCase() !== filterStatus) return false;
    return true;
  });

  return (
    <div style={{ padding: '24px', color: 'var(--ink)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>Traffic Incident Management</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-mute)', fontSize: '14px' }}>
            Dispatch patrol units, manage traffic bottlenecks, and resolve emergency alerts
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--ink-mute)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>SEVERITY</label>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            style={{ backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', color: 'var(--ink)', padding: '8px 12px', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--ink-mute)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>STATUS</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', color: 'var(--ink)', padding: '8px 12px', borderRadius: '6px', fontSize: '14px' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Incidents Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {filteredIncidents.map((inc) => (
          <div
            key={inc.id}
            style={{
              backgroundColor: 'var(--deck)',
              border: '1px solid var(--rule)',
              borderRadius: '8px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: inc.severity === 'Critical' ? 'var(--red-wash)' : inc.severity === 'High' ? 'var(--amber-wash)' : 'var(--cyan-wash)',
                  color: inc.severity === 'Critical' ? 'var(--red)' : inc.severity === 'High' ? 'var(--amber)' : 'var(--cyan-soft)',
                  border: `1px solid ${inc.severity === 'Critical' ? 'var(--red)' : inc.severity === 'High' ? 'var(--amber)' : 'var(--cyan)'}`
                }}>
                  {inc.severity.toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ink-mute)' }}>{inc.id}</span>
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--ink)' }}>{inc.title}</h3>
              <p style={{ margin: '0 0 16px', color: 'var(--ink-mute)', fontSize: '13px', lineHeight: 1.5 }}>
                {inc.description}
              </p>

              <div style={{ fontSize: '12px', color: 'var(--ink-mute)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>📍 Camera: <strong style={{ color: 'var(--ink)' }}>{inc.camera_name || inc.camera_id || 'Nagpur Central'}</strong></div>
                <div>🚔 Unit: <strong style={{ color: 'var(--cyan-soft)' }}>{inc.assigned_unit || 'Unassigned'}</strong></div>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: inc.status === 'Resolved' ? 'var(--cyan)' : inc.status === 'Investigating' ? 'var(--amber)' : 'var(--red)'
              }}>
                ● {inc.status}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {inc.status !== 'Resolved' && (
                  <button
                    onClick={() => handleUpdateStatus(inc.id, 'Resolved')}
                    style={{ backgroundColor: 'var(--cyan)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Mark Resolved
                  </button>
                )}
                {inc.status === 'Open' && (
                  <button
                    onClick={() => handleUpdateStatus(inc.id, 'Investigating')}
                    style={{ backgroundColor: 'var(--amber)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Investigate
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
