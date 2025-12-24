'use client';

import React, { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { generateNeuralNetwork, colorPalettes, NetworkNode, NeuralNetwork } from './networkGenerator';
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

// Starfield component
function Starfield() {
  const ref = useRef<THREE.Points>(null);
  const count = 8000;

  const { positions, colors, sizes } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = THREE.MathUtils.randFloat(50, 150);
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const colorChoice = Math.random();
      if (colorChoice < 0.7) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
      } else if (colorChoice < 0.85) {
        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 1;
      } else {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.8;
      }

      sizes[i] = THREE.MathUtils.randFloat(0.1, 0.3);
    }

    return { positions, colors, sizes };
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y += 0.0002;
      (ref.current.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Network visualization component
interface NetworkVisualizationProps {
  network: NeuralNetwork;
  paletteIndex: number;
  paused: boolean;
  onPulse: (position: THREE.Vector3, time: number) => void;
  pulseData: { positions: THREE.Vector3[]; times: number[]; colors: THREE.Color[] };
}

function NetworkVisualization({ network, paletteIndex, paused, pulseData }: NetworkVisualizationProps) {
  const nodesRef = useRef<THREE.Points>(null);
  const connectionsRef = useRef<THREE.LineSegments>(null);

  const palette = colorPalettes[paletteIndex];

  const nodeData = useMemo(() => {
    const positions: number[] = [];
    const types: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const distances: number[] = [];

    network.nodes.forEach((node) => {
      positions.push(node.position.x, node.position.y, node.position.z);
      types.push(node.type);
      sizes.push(node.size);
      distances.push(node.distanceFromRoot);

      const colorIndex = Math.min(node.level, palette.length - 1);
      const baseColor = palette[colorIndex % palette.length].clone();
      baseColor.offsetHSL(
        THREE.MathUtils.randFloatSpread(0.03),
        THREE.MathUtils.randFloatSpread(0.08),
        THREE.MathUtils.randFloatSpread(0.08)
      );
      colors.push(baseColor.r, baseColor.g, baseColor.b);
    });

    return {
      positions: new Float32Array(positions),
      types: new Float32Array(types),
      sizes: new Float32Array(sizes),
      colors: new Float32Array(colors),
      distances: new Float32Array(distances),
    };
  }, [network, palette]);

  const connectionData = useMemo(() => {
    const positions: number[] = [];
    const startPoints: number[] = [];
    const endPoints: number[] = [];
    const strengths: number[] = [];
    const colors: number[] = [];
    const pathIndices: number[] = [];

    const processedConnections = new Set<string>();
    let pathIndex = 0;

    network.nodes.forEach((node, nodeIndex) => {
      node.connections.forEach((connection) => {
        const connectedNode = connection.node;
        const connectedIndex = network.nodes.indexOf(connectedNode);
        if (connectedIndex === -1) return;

        const key = [Math.min(nodeIndex, connectedIndex), Math.max(nodeIndex, connectedIndex)].join('-');
        if (!processedConnections.has(key)) {
          processedConnections.add(key);
          const startPoint = node.position;
          const endPoint = connectedNode.position;
          const numSegments = 20;

          for (let i = 0; i < numSegments; i++) {
            const t = i / (numSegments - 1);
            positions.push(t, 0, 0);
            startPoints.push(startPoint.x, startPoint.y, startPoint.z);
            endPoints.push(endPoint.x, endPoint.y, endPoint.z);
            pathIndices.push(pathIndex);
            strengths.push(connection.strength);

            const avgLevel = Math.min(Math.floor((node.level + connectedNode.level) / 2), palette.length - 1);
            const baseColor = palette[avgLevel % palette.length].clone();
            baseColor.offsetHSL(
              THREE.MathUtils.randFloatSpread(0.03),
              THREE.MathUtils.randFloatSpread(0.08),
              THREE.MathUtils.randFloatSpread(0.08)
            );
            colors.push(baseColor.r, baseColor.g, baseColor.b);
          }
          pathIndex++;
        }
      });
    });

    return {
      positions: new Float32Array(positions),
      startPoints: new Float32Array(startPoints),
      endPoints: new Float32Array(endPoints),
      strengths: new Float32Array(strengths),
      colors: new Float32Array(colors),
      pathIndices: new Float32Array(pathIndices),
      count: positions.length / 3,
    };
  }, [network, palette]);

  const nodeUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPulsePositions: { value: pulseData.positions },
    uPulseTimes: { value: pulseData.times },
    uPulseColors: { value: pulseData.colors },
    uPulseSpeed: { value: 18.0 },
    uBaseNodeSize: { value: 0.6 },
  }), [pulseData]);

  const connectionUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPulsePositions: { value: pulseData.positions },
    uPulseTimes: { value: pulseData.times },
    uPulseColors: { value: pulseData.colors },
    uPulseSpeed: { value: 18.0 },
  }), [pulseData]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!paused) {
      if (nodesRef.current) {
        const mat = nodesRef.current.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = t;
        mat.uniforms.uPulsePositions.value = pulseData.positions;
        mat.uniforms.uPulseTimes.value = pulseData.times;
        mat.uniforms.uPulseColors.value = pulseData.colors;
        nodesRef.current.rotation.y = Math.sin(t * 0.04) * 0.05;
      }
      if (connectionsRef.current) {
        const mat = connectionsRef.current.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = t;
        mat.uniforms.uPulsePositions.value = pulseData.positions;
        mat.uniforms.uPulseTimes.value = pulseData.times;
        mat.uniforms.uPulseColors.value = pulseData.colors;
        connectionsRef.current.rotation.y = Math.sin(t * 0.04) * 0.05;
      }
    }
  });

  return (
    <>
      <points ref={nodesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={nodeData.positions.length / 3} array={nodeData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-nodeType" count={nodeData.types.length} array={nodeData.types} itemSize={1} />
          <bufferAttribute attach="attributes-nodeSize" count={nodeData.sizes.length} array={nodeData.sizes} itemSize={1} />
          <bufferAttribute attach="attributes-nodeColor" count={nodeData.colors.length / 3} array={nodeData.colors} itemSize={3} />
          <bufferAttribute attach="attributes-distanceFromRoot" count={nodeData.distances.length} array={nodeData.distances} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={nodeUniforms}
          vertexShader={nodeVertexShader}
          fragmentShader={nodeFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <lineSegments ref={connectionsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={connectionData.count} array={connectionData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-startPoint" count={connectionData.count} array={connectionData.startPoints} itemSize={3} />
          <bufferAttribute attach="attributes-endPoint" count={connectionData.count} array={connectionData.endPoints} itemSize={3} />
          <bufferAttribute attach="attributes-connectionStrength" count={connectionData.count} array={connectionData.strengths} itemSize={1} />
          <bufferAttribute attach="attributes-connectionColor" count={connectionData.count} array={connectionData.colors} itemSize={3} />
          <bufferAttribute attach="attributes-pathIndex" count={connectionData.count} array={connectionData.pathIndices} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          uniforms={connectionUniforms}
          vertexShader={connectionVertexShader}
          fragmentShader={connectionFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </>
  );
}


// Click handler component
interface ClickHandlerProps {
  onPulse: (position: THREE.Vector3, time: number) => void;
  paused: boolean;
}

function ClickHandler({ onPulse, paused }: ClickHandlerProps) {
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);
  const interactionPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const interactionPoint = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (paused) return;
      const target = e.target as HTMLElement;
      if (target.closest('.glass-panel, .control-buttons')) return;

      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      interactionPlane.normal.copy(camera.position).normalize();
      interactionPlane.constant = -interactionPlane.normal.dot(camera.position) + camera.position.length() * 0.5;

      if (raycaster.ray.intersectPlane(interactionPlane, interactionPoint)) {
        onPulse(interactionPoint.clone(), performance.now() / 1000);
      }
    };

    gl.domElement.addEventListener('click', handleClick);
    return () => gl.domElement.removeEventListener('click', handleClick);
  }, [camera, gl, onPulse, paused, raycaster, pointer, interactionPlane, interactionPoint]);

  return null;
}


// Main scene component
interface SceneProps {
  config: Config;
  setConfig: React.Dispatch<React.SetStateAction<Config>>;
}

function Scene({ config, setConfig }: SceneProps) {
  const controlsRef = useRef<any>(null);
  const clockRef = useRef(0);

  const [network, setNetwork] = useState<NeuralNetwork>(() =>
    generateNeuralNetwork(config.currentFormation, config.densityFactor)
  );

  const [pulseData, setPulseData] = useState({
    positions: [
      new THREE.Vector3(1e3, 1e3, 1e3),
      new THREE.Vector3(1e3, 1e3, 1e3),
      new THREE.Vector3(1e3, 1e3, 1e3),
    ],
    times: [-1e3, -1e3, -1e3],
    colors: [new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1)],
  });

  const lastPulseIndexRef = useRef(0);

  useEffect(() => {
    setNetwork(generateNeuralNetwork(config.currentFormation, config.densityFactor));
  }, [config.currentFormation, config.densityFactor]);

  const handlePulse = useCallback((position: THREE.Vector3, time: number) => {
    const idx = (lastPulseIndexRef.current + 1) % 3;
    lastPulseIndexRef.current = idx;

    const palette = colorPalettes[config.activePaletteIndex];
    const randomColor = palette[Math.floor(Math.random() * palette.length)];

    setPulseData((prev) => {
      const newPositions = [...prev.positions];
      const newTimes = [...prev.times];
      const newColors = [...prev.colors];
      newPositions[idx] = position;
      newTimes[idx] = time;
      newColors[idx] = randomColor.clone();
      return { positions: newPositions, times: newTimes, colors: newColors };
    });
  }, [config.activePaletteIndex]);

  useFrame((state) => {
    clockRef.current = state.clock.elapsedTime;
  });

  return (
    <>
      <fog attach="fog" args={[0x000000, 0.002]} />
      <Starfield />
      <NetworkVisualization
        network={network}
        paletteIndex={config.activePaletteIndex}
        paused={config.paused}
        onPulse={handlePulse}
        pulseData={pulseData}
      />
      <ClickHandler onPulse={handlePulse} paused={config.paused} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.6}
        minDistance={8}
        maxDistance={80}
        autoRotate={!config.paused}
        autoRotateSpeed={0.2}
        enablePan={false}
      />
    </>
  );
}

// UI Components
interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function GlassPanel({ children, className = '', style }: GlassPanelProps) {
  return (
    <div className={`glass-panel ${className}`} style={style}>
      {children}
    </div>
  );
}

// Main export component
export default function QuantumNeuralNetwork() {
  const [config, setConfig] = useState<Config>({
    paused: false,
    activePaletteIndex: 0,
    currentFormation: 0,
    densityFactor: 1,
  });

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

  return (
    <div className="quantum-neural-network">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600&display=swap');
        
        .quantum-neural-network {
          position: relative;
          width: 100%;
          height: 100vh;
          background: #050508;
          font-family: 'Outfit', sans-serif;
          color: rgba(255, 255, 255, 0.9);
          overflow: hidden;
        }

        .quantum-neural-network canvas {
          cursor: crosshair !important;
        }

        .glass-panel {
          backdrop-filter: blur(24px) saturate(120%);
          -webkit-backdrop-filter: blur(24px) saturate(120%);
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(255, 255, 255, 0.02);
          border-radius: 24px;
          transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
          position: absolute;
          z-index: 10;
          overflow: hidden;
        }

        .glass-panel:hover {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%);
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.05);
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .instructions-container {
          top: 32px;
          left: 32px;
          width: 280px;
          padding: 24px;
        }

        .instruction-title {
          font-weight: 500;
          font-size: 18px;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff 30%, #a5b4fc 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .instruction-text {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 300;
        }

        .theme-selector {
          top: 32px;
          right: 32px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 220px;
        }

        .theme-selector-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          margin-bottom: 4px;
        }

        .theme-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          justify-items: center;
        }

        .theme-button {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          position: relative;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 4px 10px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.2);
        }

        .theme-button.theme-1 { background: radial-gradient(circle at 30% 30%, #a78bfa, #4c1d95); }
        .theme-button.theme-2 { background: radial-gradient(circle at 30% 30%, #fb7185, #9f1239); }
        .theme-button.theme-3 { background: radial-gradient(circle at 30% 30%, #38bdf8, #0c4a6e); }

        .theme-button:hover {
          transform: scale(1.15) translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.6);
        }

        .theme-button.active::after {
          content: '';
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 0 15px rgba(255,255,255,0.3);
        }

        .density-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }

        .density-label {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 300;
        }

        .density-value {
          color: white;
          font-weight: 500;
          text-shadow: 0 0 10px rgba(255,255,255,0.3);
        }

        .density-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
          outline: none;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
        }

        .density-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 0 15px rgba(255,255,255,0.8), 0 2px 5px rgba(0,0,0,0.3);
          transition: all 0.2s ease;
        }

        .density-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 20px rgba(255,255,255,1);
        }

        .control-buttons {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 16px;
          z-index: 20;
          padding: 8px;
        }

        .control-button {
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: 1px solid rgba(255, 255, 255, 0.25);
          color: rgba(255, 255, 255, 0.9);
          padding: 12px 24px;
          border-radius: 50px;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          transition: all 0.3s ease;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3), inset 0 0 10px rgba(255,255,255,0.02);
          min-width: 100px;
          text-align: center;
        }

        .control-button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.4);
          transform: translateY(-4px);
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 255, 255, 0.1);
          text-shadow: 0 0 8px rgba(255,255,255,0.6);
        }

        .control-button:active {
          transform: translateY(-1px);
        }

        @media (max-width: 640px) {
          .instructions-container {
            top: 16px;
            left: 16px;
            right: 16px;
            width: auto;
            padding: 16px;
          }
          .theme-selector {
            top: auto;
            bottom: 100px;
            left: 16px;
            right: 16px;
            width: auto;
            padding: 16px;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
          .control-buttons {
            bottom: 24px;
            width: 100%;
            justify-content: center;
            gap: 8px;
            padding: 0 16px;
          }
          .control-button {
            padding: 10px 16px;
            min-width: auto;
            font-size: 11px;
            flex: 1;
          }
        }
      `}</style>

      <Canvas
        camera={{ position: [0, 8, 28], fov: 65, near: 0.1, far: 1000 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene config={config} setConfig={setConfig} />
      </Canvas>

      {/* Instructions Panel */}
      <GlassPanel className="instructions-container">
        <div className="instruction-title">Quantum Neural Network</div>
        <div className="instruction-text">
          Click to send energy pulses.<br />
          Drag to explore the structure.
        </div>
      </GlassPanel>

      {/* Theme Selector Panel */}
      <GlassPanel className="theme-selector">
        <div style={{ flex: 1 }}>
          <div className="theme-selector-title">Crystal Theme</div>
          <div className="theme-grid">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                className={`theme-button theme-${i + 1} ${config.activePaletteIndex === i ? 'active' : ''}`}
                onClick={() => handleThemeChange(i)}
                aria-label={['Purple Nebula', 'Sunset Fire', 'Ocean Aurora'][i]}
              />
            ))}
          </div>
        </div>
        <div className="density-controls" style={{ flex: 1 }}>
          <div className="density-label">
            <span>Density</span>
            <span className="density-value">{Math.round(config.densityFactor * 100)}%</span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            value={config.densityFactor * 100}
            className="density-slider"
            onChange={(e) => handleDensityChange(parseInt(e.target.value, 10))}
            aria-label="Network Density"
          />
        </div>
      </GlassPanel>

      {/* Control Buttons */}
      <div className="control-buttons">
        <button className="control-button" onClick={handleMorph}>
          <span>Morph</span>
        </button>
        <button className="control-button" onClick={handleFreeze}>
          <span>{config.paused ? 'Play' : 'Freeze'}</span>
        </button>
        <button className="control-button" onClick={() => window.location.reload()}>
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
}
