'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { generateNeuralNetwork, colorPalettes, NeuralNetwork } from './networkGenerator';
import {
  nodeVertexShader,
  nodeFragmentShader,
  connectionVertexShader,
  connectionFragmentShader,
  starVertexShader,
  starFragmentShader,
} from './shaders';

interface Config {
  paused: boolean;
  activePaletteIndex: number;
  currentFormation: number;
  densityFactor: number;
}

export default function QuantumNeuralNetworkCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    controls: OrbitControls;
    clock: THREE.Clock;
    nodesMesh: THREE.Points | null;
    connectionsMesh: THREE.LineSegments | null;
    starField: THREE.Points;
    pulseUniforms: any;
    network: NeuralNetwork | null;
  } | null>(null);

  const [config, setConfig] = useState<Config>({
    paused: false,
    activePaletteIndex: 0,
    currentFormation: 0,
    densityFactor: 1,
  });

  const lastPulseIndexRef = useRef(0);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || sceneRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.002);

    // Camera
    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    camera.position.set(0, 8, 28);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = 'crosshair';

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.6;
    controls.minDistance = 8;
    controls.maxDistance = 80;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.enablePan = false;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.8, 0.6, 0.7
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // Create starfield
    const starCount = 8000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const r = THREE.MathUtils.randFloat(50, 150);
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const colorChoice = Math.random();
      if (colorChoice < 0.7) {
        starColors[i * 3] = 1; starColors[i * 3 + 1] = 1; starColors[i * 3 + 2] = 1;
      } else if (colorChoice < 0.85) {
        starColors[i * 3] = 0.7; starColors[i * 3 + 1] = 0.8; starColors[i * 3 + 2] = 1;
      } else {
        starColors[i * 3] = 1; starColors[i * 3 + 1] = 0.9; starColors[i * 3 + 2] = 0.8;
      }
      starSizes[i] = THREE.MathUtils.randFloat(0.1, 0.3);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Pulse uniforms
    const pulseUniforms = {
      uTime: { value: 0 },
      uPulsePositions: { value: [
        new THREE.Vector3(1e3, 1e3, 1e3),
        new THREE.Vector3(1e3, 1e3, 1e3),
        new THREE.Vector3(1e3, 1e3, 1e3),
      ]},
      uPulseTimes: { value: [-1e3, -1e3, -1e3] },
      uPulseColors: { value: [
        new THREE.Color(1, 1, 1),
        new THREE.Color(1, 1, 1),
        new THREE.Color(1, 1, 1),
      ]},
      uPulseSpeed: { value: 18.0 },
      uBaseNodeSize: { value: 0.6 },
    };

    const clock = new THREE.Clock();

    sceneRef.current = {
      scene, camera, renderer, composer, controls, clock,
      nodesMesh: null, connectionsMesh: null, starField, pulseUniforms, network: null,
    };

    // Animation loop
    function animate() {
      if (!sceneRef.current) return;
      requestAnimationFrame(animate);

      const { scene, camera, composer, controls, clock, nodesMesh, connectionsMesh, starField, pulseUniforms } = sceneRef.current;
      const t = clock.getElapsedTime();

      // Update starfield
      starField.rotation.y += 0.0002;
      (starField.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      // Update network
      if (nodesMesh && !config.paused) {
        (nodesMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
        nodesMesh.rotation.y = Math.sin(t * 0.04) * 0.05;
      }
      if (connectionsMesh && !config.paused) {
        (connectionsMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
        connectionsMesh.rotation.y = Math.sin(t * 0.04) * 0.05;
      }

      controls.update();
      composer.render();
    }

    animate();

    // Resize handler
    const handleResize = () => {
      if (!sceneRef.current) return;
      const { camera, renderer, composer } = sceneRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Create network visualization
  const createNetworkVisualization = useCallback((formationIndex: number, densityFactor: number, paletteIndex: number) => {
    if (!sceneRef.current) return;

    const { scene, pulseUniforms } = sceneRef.current;
    const palette = colorPalettes[paletteIndex];

    // Remove old meshes
    if (sceneRef.current.nodesMesh) {
      scene.remove(sceneRef.current.nodesMesh);
      sceneRef.current.nodesMesh.geometry.dispose();
      (sceneRef.current.nodesMesh.material as THREE.Material).dispose();
    }
    if (sceneRef.current.connectionsMesh) {
      scene.remove(sceneRef.current.connectionsMesh);
      sceneRef.current.connectionsMesh.geometry.dispose();
      (sceneRef.current.connectionsMesh.material as THREE.Material).dispose();
    }

    // Generate network
    const network = generateNeuralNetwork(formationIndex, densityFactor);
    sceneRef.current.network = network;

    // Create nodes
    const nodePositions: number[] = [];
    const nodeTypes: number[] = [];
    const nodeSizes: number[] = [];
    const nodeColors: number[] = [];
    const distancesFromRoot: number[] = [];

    network.nodes.forEach((node) => {
      nodePositions.push(node.position.x, node.position.y, node.position.z);
      nodeTypes.push(node.type);
      nodeSizes.push(node.size);
      distancesFromRoot.push(node.distanceFromRoot);

      const colorIndex = Math.min(node.level, palette.length - 1);
      const baseColor = palette[colorIndex % palette.length].clone();
      baseColor.offsetHSL(
        THREE.MathUtils.randFloatSpread(0.03),
        THREE.MathUtils.randFloatSpread(0.08),
        THREE.MathUtils.randFloatSpread(0.08)
      );
      nodeColors.push(baseColor.r, baseColor.g, baseColor.b);
    });

    const nodesGeo = new THREE.BufferGeometry();
    nodesGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    nodesGeo.setAttribute('nodeType', new THREE.Float32BufferAttribute(nodeTypes, 1));
    nodesGeo.setAttribute('nodeSize', new THREE.Float32BufferAttribute(nodeSizes, 1));
    nodesGeo.setAttribute('nodeColor', new THREE.Float32BufferAttribute(nodeColors, 3));
    nodesGeo.setAttribute('distanceFromRoot', new THREE.Float32BufferAttribute(distancesFromRoot, 1));

    const nodesMat = new THREE.ShaderMaterial({
      uniforms: { ...pulseUniforms },
      vertexShader: nodeVertexShader,
      fragmentShader: nodeFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const nodesMesh = new THREE.Points(nodesGeo, nodesMat);
    scene.add(nodesMesh);
    sceneRef.current.nodesMesh = nodesMesh;

    // Create connections
    const connPositions: number[] = [];
    const startPoints: number[] = [];
    const endPoints: number[] = [];
    const strengths: number[] = [];
    const connColors: number[] = [];
    const pathIndices: number[] = [];

    const processedConnections = new Set<string>();
    let pathIndex = 0;

    network.nodes.forEach((node, nodeIndex) => {
      node.connections.forEach((connection) => {
        const connectedNode = connection.node;
        const connectedIndex = network.nodes.indexOf(connectedNode);
        if (connectedIndex === -1) return;

        const key = `${Math.min(nodeIndex, connectedIndex)}-${Math.max(nodeIndex, connectedIndex)}`;
        if (!processedConnections.has(key)) {
          processedConnections.add(key);
          const numSegments = 20;

          for (let i = 0; i < numSegments; i++) {
            const t = i / (numSegments - 1);
            connPositions.push(t, 0, 0);
            startPoints.push(node.position.x, node.position.y, node.position.z);
            endPoints.push(connectedNode.position.x, connectedNode.position.y, connectedNode.position.z);
            pathIndices.push(pathIndex);
            strengths.push(connection.strength);

            const avgLevel = Math.min(Math.floor((node.level + connectedNode.level) / 2), palette.length - 1);
            const baseColor = palette[avgLevel % palette.length].clone();
            baseColor.offsetHSL(
              THREE.MathUtils.randFloatSpread(0.03),
              THREE.MathUtils.randFloatSpread(0.08),
              THREE.MathUtils.randFloatSpread(0.08)
            );
            connColors.push(baseColor.r, baseColor.g, baseColor.b);
          }
          pathIndex++;
        }
      });
    });

    const connGeo = new THREE.BufferGeometry();
    connGeo.setAttribute('position', new THREE.Float32BufferAttribute(connPositions, 3));
    connGeo.setAttribute('startPoint', new THREE.Float32BufferAttribute(startPoints, 3));
    connGeo.setAttribute('endPoint', new THREE.Float32BufferAttribute(endPoints, 3));
    connGeo.setAttribute('connectionStrength', new THREE.Float32BufferAttribute(strengths, 1));
    connGeo.setAttribute('connectionColor', new THREE.Float32BufferAttribute(connColors, 3));
    connGeo.setAttribute('pathIndex', new THREE.Float32BufferAttribute(pathIndices, 1));

    const connMat = new THREE.ShaderMaterial({
      uniforms: { ...pulseUniforms },
      vertexShader: connectionVertexShader,
      fragmentShader: connectionFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const connectionsMesh = new THREE.LineSegments(connGeo, connMat);
    scene.add(connectionsMesh);
    sceneRef.current.connectionsMesh = connectionsMesh;

    // Update pulse colors
    palette.forEach((color, i) => {
      if (i < 3) {
        pulseUniforms.uPulseColors.value[i].copy(color);
      }
    });
  }, []);

  // Initialize network on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      createNetworkVisualization(config.currentFormation, config.densityFactor, config.activePaletteIndex);
    }, 100);
    return () => clearTimeout(timer);
  }, [config.currentFormation, config.densityFactor, config.activePaletteIndex, createNetworkVisualization]);

  // Update controls based on paused state
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.controls.autoRotate = !config.paused;
    }
  }, [config.paused]);

  // Click handler for pulses
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!sceneRef.current || config.paused) return;
      const target = e.target as HTMLElement;
      if (target.closest('.glass-panel, .control-buttons')) return;

      const { camera, clock, nodesMesh, connectionsMesh, pulseUniforms } = sceneRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pointer = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);

      const interactionPlane = new THREE.Plane();
      interactionPlane.normal.copy(camera.position).normalize();
      interactionPlane.constant = -interactionPlane.normal.dot(camera.position) + camera.position.length() * 0.5;

      const interactionPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(interactionPlane, interactionPoint)) {
        const time = clock.getElapsedTime();
        const idx = (lastPulseIndexRef.current + 1) % 3;
        lastPulseIndexRef.current = idx;

        const palette = colorPalettes[config.activePaletteIndex];
        const randomColor = palette[Math.floor(Math.random() * palette.length)];

        pulseUniforms.uPulsePositions.value[idx].copy(interactionPoint);
        pulseUniforms.uPulseTimes.value[idx] = time;
        pulseUniforms.uPulseColors.value[idx].copy(randomColor);

        if (nodesMesh) {
          (nodesMesh.material as THREE.ShaderMaterial).uniforms.uPulsePositions.value = pulseUniforms.uPulsePositions.value;
          (nodesMesh.material as THREE.ShaderMaterial).uniforms.uPulseTimes.value = pulseUniforms.uPulseTimes.value;
          (nodesMesh.material as THREE.ShaderMaterial).uniforms.uPulseColors.value = pulseUniforms.uPulseColors.value;
        }
        if (connectionsMesh) {
          (connectionsMesh.material as THREE.ShaderMaterial).uniforms.uPulsePositions.value = pulseUniforms.uPulsePositions.value;
          (connectionsMesh.material as THREE.ShaderMaterial).uniforms.uPulseTimes.value = pulseUniforms.uPulseTimes.value;
          (connectionsMesh.material as THREE.ShaderMaterial).uniforms.uPulseColors.value = pulseUniforms.uPulseColors.value;
        }
      }
    };

    const container = containerRef.current;
    container?.addEventListener('click', handleClick);
    return () => container?.removeEventListener('click', handleClick);
  }, [config.paused, config.activePaletteIndex]);

  const handleThemeChange = (index: number) => {
    setConfig((prev) => ({ ...prev, activePaletteIndex: index }));
  };

  const handleMorph = () => {
    setConfig((prev) => ({
      ...prev,
      currentFormation: (prev.currentFormation + 1) % 3,
    }));
  };

  const handleFreeze = () => {
    setConfig((prev) => ({ ...prev, paused: !prev.paused }));
  };

  const handleDensityChange = (value: number) => {
    setConfig((prev) => ({ ...prev, densityFactor: value / 100 }));
  };

  const handleReset = () => {
    if (sceneRef.current) {
      sceneRef.current.controls.reset();
    }
  };

  return (
    <div className="quantum-neural-network" style={{ position: 'relative', width: '100%', height: '100vh', background: '#050508', fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.9)', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Instructions Panel */}
      <div className="glass-panel" style={{ position: 'absolute', top: 32, left: 32, width: 280, padding: 24, backdropFilter: 'blur(24px) saturate(120%)', background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.2)', borderLeft: '1px solid rgba(255,255,255,0.2)', borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 10 }}>
        <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 8, background: 'linear-gradient(135deg, #fff 30%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Quantum Neural Network
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>
          Click to send energy pulses.<br />
          Drag to explore the structure.
        </div>
      </div>

      {/* Theme Selector Panel */}
      <div className="glass-panel" style={{ position: 'absolute', top: 32, right: 32, padding: 24, width: 220, backdropFilter: 'blur(24px) saturate(120%)', background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.2)', borderLeft: '1px solid rgba(255,255,255,0.2)', borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 10 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 12 }}>
          Crystal Theme
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, justifyItems: 'center', marginBottom: 16 }}>
          {[
            'radial-gradient(circle at 30% 30%, #a78bfa, #4c1d95)',
            'radial-gradient(circle at 30% 30%, #fb7185, #9f1239)',
            'radial-gradient(circle at 30% 30%, #38bdf8, #0c4a6e)',
          ].map((bg, i) => (
            <button
              key={i}
              onClick={() => handleThemeChange(i)}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: bg,
                boxShadow: config.activePaletteIndex === i
                  ? '0 0 0 3px rgba(255,255,255,0.9), 0 4px 10px rgba(0,0,0,0.3)'
                  : '0 4px 10px rgba(0,0,0,0.3)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
          <span>Density</span>
          <span style={{ color: 'white', fontWeight: 500 }}>{Math.round(config.densityFactor * 100)}%</span>
        </div>
        <input
          type="range"
          min="30"
          max="100"
          value={config.densityFactor * 100}
          onChange={(e) => handleDensityChange(parseInt(e.target.value, 10))}
          style={{ width: '100%', accentColor: '#a78bfa' }}
        />
      </div>

      {/* Control Buttons */}
      <div className="control-buttons" style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 16, zIndex: 20 }}>
        {[
          { label: 'Morph', onClick: handleMorph },
          { label: config.paused ? 'Play' : 'Freeze', onClick: handleFreeze },
          { label: 'Reset', onClick: handleReset },
        ].map((btn) => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            style={{
              backdropFilter: 'blur(20px) saturate(140%)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderTop: '1px solid rgba(255,255,255,0.25)',
              color: 'rgba(255,255,255,0.9)',
              padding: '12px 24px',
              borderRadius: 50,
              cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              minWidth: 100,
              transition: 'all 0.3s ease',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
