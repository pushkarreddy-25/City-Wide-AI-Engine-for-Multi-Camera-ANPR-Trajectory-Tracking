import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

/**
 * AuditLogs Component
 * Security audit trail table documenting user actions, camera configuration changes, and system events.
 */
export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const data = await api.auditLogs.list();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to fetch audit logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAuditLogs();
  }, []);


  return (
    <div style={{ padding: '24px', color: 'var(--ink)' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>Security Audit Trail</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-mute)', fontSize: '14px' }}>
          Immutably logged operator activity, system setting modifications, and security events
        </p>
      </div>

      <div style={{ backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--void)', borderBottom: '1px solid var(--rule)', color: 'var(--ink-mute)' }}>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>LOG ID</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>TIMESTAMP</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>OPERATOR / USER</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>ACTION</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>RESOURCE</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>DETAILS</th>
              <th style={{ padding: '14px 16px', fontWeight: 600 }}>IP ADDRESS</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-mute)' }}>
                  No audit logs recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--cyan-soft)', fontWeight: 600 }}>{log.id}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--ink-mute)', fontSize: '13px' }}>{log.timestamp}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>{log.user}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      backgroundColor: 'var(--cyan-wash)',
                      color: 'var(--cyan-soft)',
                      border: '1px solid var(--cyan-dim)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--ink-dim)' }}>{log.resource || '—'}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--ink-mute)' }}>{log.details}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--ink-mute)', fontSize: '13px' }}>{log.ip_address}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
