import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

/**
 * AIModels Component
 * Multi-Provider AI Model Router management page with interactive query console.
 */
export default function AIModels() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);

  useEffect(() => {
    api.ai.models()
      .then(data => {
        if (data && data.models) setModels(data.models);
      })
      .catch(err => console.error(err));
  }, []);

  const handleRouteQuery = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const data = await api.ai.routeQuery(prompt);
      if (data) {
        setResult(data);
      }
    } catch (err) {
      console.error('AI Query failed:', err);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div style={{ padding: '24px', color: 'var(--ink)' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>AI Multi-Model Provider Router</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-mute)', fontSize: '14px' }}>
          Cost-optimized model routing across OpenAI, Anthropic, Gemini, and Groq with automatic fallback
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Interactive Query Router Console */}
        <div style={{ backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', borderRadius: '8px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>Surveillance Query Router</h3>
          <form onSubmit={handleRouteQuery}>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask a surveillance question or task... e.g. 'Analyze plate recognition accuracy across Zero Mile intersection'"
              style={{
                width: '100%',
                backgroundColor: 'var(--void)',
                border: '1px solid var(--rule)',
                borderRadius: '6px',
                color: 'var(--ink)',
                padding: '12px',
                fontSize: '14px',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
                marginBottom: '12px'
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: 'var(--cyan)',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Routing Query...' : 'Route & Execute Prompt'}
            </button>
          </form>

          {/* Router Output */}
          {result && (
            <div style={{ marginTop: '20px', backgroundColor: 'var(--void)', border: '1px solid var(--rule)', borderRadius: '6px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid var(--rule)', paddingBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--ink-mute)', fontWeight: 600 }}>SELECTED MODEL</span>
                  <div style={{ color: 'var(--cyan-soft)', fontWeight: 700 }}>{result.selection.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-mute)', fontWeight: 600 }}>EST. COST</span>
                  <div style={{ color: 'var(--cyan)', fontWeight: 600 }}>${result.selection.estimated_cost_usd}</div>
                </div>
              </div>
              <pre style={{ margin: 0, color: 'var(--ink)', fontSize: '13px', whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)' }}>
                {result.response}
              </pre>
            </div>
          )}
        </div>

        {/* Model Registry Cards */}
        <div style={{ backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', borderRadius: '8px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>Available Model Registry</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '450px', overflowY: 'auto' }}>
            {models.map((m) => (
              <div key={m.id} style={{ backgroundColor: 'var(--void)', border: '1px solid var(--rule)', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-mute)', marginTop: '2px' }}>
                    Provider: {m.provider.toUpperCase()} | ${m.cost_in}/1M In, ${m.cost_out}/1M Out
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: m.active ? 'var(--cyan-wash)' : 'var(--void)',
                  color: m.active ? 'var(--cyan-soft)' : 'var(--ink-mute)',
                  border: `1px solid ${m.active ? 'var(--cyan-dim)' : 'var(--rule)'}`
                }}>
                  {m.active ? 'Key Active' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
