import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * ThreeDCarViewer Component
 * Real 3D WebGL Canvas Vehicle Viewer powered by Three.js.
 * Renders a full 3D vehicle geometry (chassis, cabin, wheels, headlights, license plate)
 * with interactive drag-to-rotate controls, lighting, and wireframe shader toggle.
 */
export default function ThreeDCarViewer({ isOpen, onClose, vehicleData }) {
  const mountRef = useRef(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  const vehicle = vehicleData || {
    plate: "MH-31-FA-4921",
    type: "SUV",
    color: "Dark Blue",
    confidence: 0.962,
    camera: "CAM-001 (Zero Mile)",
    speed: "64.2 km/h"
  };

  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4, 2.5, 5);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    mountRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x2563eb, 1.2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(12, 24, 0xcbd5e1, 0xe2e8f0);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const carGroup = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(2.4, 0.6, 1.2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.4,
      roughness: 0.3,
      wireframe: wireframe
    });
    const chassis = new THREE.Mesh(bodyGeo, bodyMat);
    chassis.position.y = 0.5;
    carGroup.add(chassis);

    const cabinGeo = new THREE.BoxGeometry(1.3, 0.5, 1.0);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.2,
      wireframe: wireframe,
      transparent: true,
      opacity: 0.85
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(-0.1, 0.95, 0);
    carGroup.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 24);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8, wireframe: wireframe });
    const wheelPositions = [
      [0.7, 0.28, 0.65],
      [0.7, 0.28, -0.65],
      [-0.7, 0.28, 0.65],
      [-0.7, 0.28, -0.65],
    ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, y, z);
      carGroup.add(wheel);
    });

    const lightGeo = new THREE.BoxGeometry(0.08, 0.12, 0.24);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headlightR = new THREE.Mesh(lightGeo, lightMat);
    headlightR.position.set(1.21, 0.55, 0.38);
    const headlightL = new THREE.Mesh(lightGeo, lightMat);
    headlightL.position.set(1.21, 0.55, -0.38);
    carGroup.add(headlightR);
    carGroup.add(headlightL);

    const plateGeo = new THREE.BoxGeometry(0.04, 0.12, 0.45);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(1.22, 0.35, 0);
    carGroup.add(plateMesh);

    scene.add(carGroup);

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const domElem = mountRef.current;

    const onMouseDown = (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      carGroup.rotation.y += deltaX * 0.01;
      carGroup.rotation.x += deltaY * 0.005;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => { isDragging = false; };

    domElem.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (autoRotate && !isDragging) {
        carGroup.rotation.y += 0.008;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      domElem.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [isOpen, wireframe, autoRotate]);

  if (!isOpen) return null;

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
        maxWidth: '820px',
        backgroundColor: 'var(--deck)',
        border: '1px solid var(--rule-hi)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🚘</span>
            <div>
              <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: '14px', fontWeight: 700 }}>
                3D Vehicle Inspection
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--ink-mute)' }}>
                Plate: <strong style={{ color: 'var(--ink)' }}>{vehicle.plate}</strong> | Type: {vehicle.type}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-mute)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '2px 6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 3D WebGL Viewport Container */}
        <div style={{ position: 'relative', height: '360px', backgroundColor: '#f1f5f9' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

          {/* Viewer Controls Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10,
            pointerEvents: 'none'
          }}>
            <div style={{ display: 'flex', gap: '6px', pointerEvents: 'auto' }}>
              <button
                onClick={() => setWireframe(!wireframe)}
                className="btn btn-sm"
                style={{
                  backgroundColor: wireframe ? 'var(--cyan)' : 'var(--deck)',
                  color: wireframe ? '#ffffff' : 'var(--ink)'
                }}
              >
                {wireframe ? 'Solid Shader' : 'Wireframe'}
              </button>

              <button
                onClick={() => setAutoRotate(!autoRotate)}
                className="btn btn-sm"
                style={{
                  backgroundColor: autoRotate ? 'var(--green)' : 'var(--deck)',
                  color: autoRotate ? '#ffffff' : 'var(--ink)'
                }}
              >
                {autoRotate ? 'Auto-Rotate ON' : 'Auto-Rotate OFF'}
              </button>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--ink-mute)', backgroundColor: 'var(--deck)', border: '1px solid var(--rule)', padding: '3px 8px', borderRadius: 'var(--r)' }}>
              Drag mouse to orbit 3D view
            </span>
          </div>
        </div>

        {/* Telemetry Footer */}
        <div style={{
          padding: '14px 18px',
          backgroundColor: 'var(--void)',
          borderTop: '1px solid var(--rule)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mute)', fontWeight: 500 }}>Color Class</div>
            <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '13px' }}>{vehicle.color}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mute)', fontWeight: 500 }}>Speed Est.</div>
            <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '13px' }}>{vehicle.speed}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mute)', fontWeight: 500 }}>Source Node</div>
            <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '13px' }}>{vehicle.camera}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ink-mute)', fontWeight: 500 }}>OCR Confidence</div>
            <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: '13px' }}>{((vehicle.confidence || 0.95) * 100).toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
