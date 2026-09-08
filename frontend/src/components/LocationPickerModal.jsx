import React, { useState } from 'react';

/**
 * LocationPickerModal Component
 * Interactive modal allowing operators to select camera latitude/longitude via map click.
 */
export default function LocationPickerModal({ isOpen, onClose, onSelectLocation, initialPos }) {
  const [selectedPos, setSelectedPos] = useState(initialPos || { lat: 21.1458, lng: 79.0882 });

  if (!isOpen) return null;

  const handleSimulatedMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const lat = Number((21.1650 - (y * 0.0400)).toFixed(4));
    const lng = Number((79.0600 + (x * 0.0600)).toFixed(4));
    
    setSelectedPos({ lat, lng });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.5)'
    }}>
      <div style={{
        width: '90%',
        maxWidth: '680px',
        backgroundColor: 'var(--deck)',
        border: '1px solid var(--rule-hi)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          backgroundColor: 'var(--deck-2)',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: '14px', fontWeight: 700 }}>Select Camera Location Coordinates</h3>
            <span style={{ fontSize: '12px', color: 'var(--ink-mute)' }}>Click map location grid to set camera latitude and longitude</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-mute)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Map Viewport Area */}
        <div
          onClick={handleSimulatedMapClick}
          style={{
            height: '320px',
            backgroundColor: '#f1f5f9',
            position: 'relative',
            cursor: 'crosshair',
            overflow: 'hidden'
          }}
        >
          {/* Grid Background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }} />

          {/* Crosshair pin */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '24px' }}>📍</span>
            <div style={{
              backgroundColor: 'var(--cyan)',
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: 'var(--r)',
              fontSize: '11px',
              fontWeight: 600,
              marginTop: '-2px'
            }}>
              {selectedPos.lat}, {selectedPos.lng}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 18px',
          backgroundColor: 'var(--void)',
          borderTop: '1px solid var(--rule)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ color: 'var(--ink-dim)', fontSize: '12.5px' }}>
            Selected: <strong style={{ color: 'var(--ink)' }}>Lat {selectedPos.lat}, Lng {selectedPos.lng}</strong>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} className="btn">Cancel</button>
            <button
              onClick={() => {
                onSelectLocation(selectedPos);
                onClose();
              }}
              className="btn btn-primary"
            >
              Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
