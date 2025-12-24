import * as THREE from 'three';

export interface NetworkNode {
  position: THREE.Vector3;
  connections: { node: NetworkNode; strength: number }[];
  level: number;
  type: number;
  size: number;
  distanceFromRoot: number;
  helixIndex?: number;
  helixT?: number;
}

export interface NeuralNetwork {
  nodes: NetworkNode[];
  rootNode: NetworkNode;
}

function createNode(position: THREE.Vector3, level: number = 0, type: number = 0): NetworkNode {
  return {
    position,
    connections: [],
    level,
    type,
    size: type === 0 ? THREE.MathUtils.randFloat(0.8, 1.4) : THREE.MathUtils.randFloat(0.5, 1.0),
    distanceFromRoot: 0,
  };
}

function addConnection(node1: NetworkNode, node2: NetworkNode, strength: number = 1.0) {
  if (!isConnectedTo(node1, node2)) {
    node1.connections.push({ node: node2, strength });
    node2.connections.push({ node: node1, strength });
  }
}

function isConnectedTo(node1: NetworkNode, node2: NetworkNode): boolean {
  return node1.connections.some(conn => conn.node === node2);
}

function generateCrystallineSphere(densityFactor: number): NeuralNetwork {
  const nodes: NetworkNode[] = [];
  const rootNode = createNode(new THREE.Vector3(0, 0, 0), 0, 0);
  rootNode.size = 2.0;
  nodes.push(rootNode);

  const layers = 5;
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let layer = 1; layer <= layers; layer++) {
    const radius = layer * 4;
    const numPoints = Math.floor(layer * 12 * densityFactor);

    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / numPoints);
      const theta = 2 * Math.PI * i / goldenRatio;
      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );

      const isLeaf = layer === layers || Math.random() < 0.3;
      const node = createNode(pos, layer, isLeaf ? 1 : 0);
      node.distanceFromRoot = radius;
      nodes.push(node);

      if (layer > 1) {
        const prevLayerNodes = nodes.filter(n => n.level === layer - 1 && n !== rootNode);
        prevLayerNodes.sort((a, b) => pos.distanceTo(a.position) - pos.distanceTo(b.position));
        for (let j = 0; j < Math.min(3, prevLayerNodes.length); j++) {
          const dist = pos.distanceTo(prevLayerNodes[j].position);
          const strength = 1.0 - (dist / (radius * 2));
          addConnection(node, prevLayerNodes[j], Math.max(0.3, strength));
        }
      } else {
        addConnection(rootNode, node, 0.9);
      }
    }

    const layerNodes = nodes.filter(n => n.level === layer && n !== rootNode);
    for (const node of layerNodes) {
      const nearby = layerNodes
        .filter(n => n !== node)
        .sort((a, b) => node.position.distanceTo(a.position) - node.position.distanceTo(b.position))
        .slice(0, 5);
      for (const nearNode of nearby) {
        const dist = node.position.distanceTo(nearNode.position);
        if (dist < radius * 0.8 && !isConnectedTo(node, nearNode)) {
          addConnection(node, nearNode, 0.6);
        }
      }
    }
  }

  const outerNodes = nodes.filter(n => n.level >= 3);
  for (let i = 0; i < Math.min(20, outerNodes.length); i++) {
    const n1 = outerNodes[Math.floor(Math.random() * outerNodes.length)];
    const n2 = outerNodes[Math.floor(Math.random() * outerNodes.length)];
    if (n1 !== n2 && !isConnectedTo(n1, n2) && Math.abs(n1.level - n2.level) > 1) {
      addConnection(n1, n2, 0.4);
    }
  }

  return { nodes, rootNode };
}

function generateHelixLattice(densityFactor: number): NeuralNetwork {
  const nodes: NetworkNode[] = [];
  const rootNode = createNode(new THREE.Vector3(0, 0, 0), 0, 0);
  rootNode.size = 1.8;
  nodes.push(rootNode);

  const numHelices = 4;
  const height = 30;
  const maxRadius = 12;
  const nodesPerHelix = Math.floor(50 * densityFactor);
  const helixArrays: NetworkNode[][] = [];

  for (let h = 0; h < numHelices; h++) {
    const helixPhase = (h / numHelices) * Math.PI * 2;
    const helixNodes: NetworkNode[] = [];

    for (let i = 0; i < nodesPerHelix; i++) {
      const t = i / (nodesPerHelix - 1);
      const y = (t - 0.5) * height;
      const radiusScale = Math.sin(t * Math.PI) * 0.7 + 0.3;
      const radius = maxRadius * radiusScale;
      const angle = helixPhase + t * Math.PI * 6;

      const pos = new THREE.Vector3(
        radius * Math.cos(angle),
        y,
        radius * Math.sin(angle)
      );

      const level = Math.ceil(t * 5);
      const isLeaf = i > nodesPerHelix - 5 || Math.random() < 0.25;
      const node = createNode(pos, level, isLeaf ? 1 : 0);
      node.distanceFromRoot = Math.sqrt(radius * radius + y * y);
      node.helixIndex = h;
      node.helixT = t;
      nodes.push(node);
      helixNodes.push(node);
    }

    helixArrays.push(helixNodes);
    addConnection(rootNode, helixNodes[0], 1.0);

    for (let i = 0; i < helixNodes.length - 1; i++) {
      addConnection(helixNodes[i], helixNodes[i + 1], 0.85);
    }
  }

  for (let h = 0; h < numHelices; h++) {
    const currentHelix = helixArrays[h];
    const nextHelix = helixArrays[(h + 1) % numHelices];
    for (let i = 0; i < currentHelix.length; i += 5) {
      const t = currentHelix[i].helixT!;
      const targetIdx = Math.round(t * (nextHelix.length - 1));
      if (targetIdx < nextHelix.length) {
        addConnection(currentHelix[i], nextHelix[targetIdx], 0.7);
      }
    }
  }

  for (const helix of helixArrays) {
    for (let i = 0; i < helix.length; i += 8) {
      const node = helix[i];
      const innerNodes = nodes.filter(n =>
        n !== node && n !== rootNode && n.distanceFromRoot < node.distanceFromRoot * 0.5
      );
      if (innerNodes.length > 0) {
        const nearest = innerNodes.sort((a, b) =>
          node.position.distanceTo(a.position) - node.position.distanceTo(b.position)
        )[0];
        addConnection(node, nearest, 0.5);
      }
    }
  }

  const allHelixNodes = nodes.filter(n => n !== rootNode);
  for (let i = 0; i < Math.floor(30 * densityFactor); i++) {
    const n1 = allHelixNodes[Math.floor(Math.random() * allHelixNodes.length)];
    const nearby = allHelixNodes.filter(n => {
      const dist = n.position.distanceTo(n1.position);
      return n !== n1 && dist < 8 && dist > 3 && !isConnectedTo(n1, n);
    });
    if (nearby.length > 0) {
      const n2 = nearby[Math.floor(Math.random() * nearby.length)];
      addConnection(n1, n2, 0.45);
    }
  }

  return { nodes, rootNode };
}

function generateFractalWeb(densityFactor: number): NeuralNetwork {
  const nodes: NetworkNode[] = [];
  const rootNode = createNode(new THREE.Vector3(0, 0, 0), 0, 0);
  rootNode.size = 1.6;
  nodes.push(rootNode);

  const branches = 6;
  const maxDepth = 4;

  function createBranch(startNode: NetworkNode, direction: THREE.Vector3, depth: number, strength: number, scale: number) {
    if (depth > maxDepth) return;
    const branchLength = 5 * scale;
    const endPos = new THREE.Vector3()
      .copy(startNode.position)
      .add(direction.clone().multiplyScalar(branchLength));
    const isLeaf = depth === maxDepth || Math.random() < 0.3;
    const newNode = createNode(endPos, depth, isLeaf ? 1 : 0);
    newNode.distanceFromRoot = rootNode.position.distanceTo(endPos);
    nodes.push(newNode);
    addConnection(startNode, newNode, strength);

    if (depth < maxDepth) {
      const subBranches = 3;
      for (let i = 0; i < subBranches; i++) {
        const angle = (i / subBranches) * Math.PI * 2;
        const perpDir1 = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
        const perpDir2 = direction.clone().cross(perpDir1).normalize();
        const newDir = new THREE.Vector3()
          .copy(direction)
          .add(perpDir1.clone().multiplyScalar(Math.cos(angle) * 0.7))
          .add(perpDir2.clone().multiplyScalar(Math.sin(angle) * 0.7))
          .normalize();
        createBranch(newNode, newDir, depth + 1, strength * 0.7, scale * 0.75);
      }
    }
  }

  for (let i = 0; i < branches; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / branches);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const direction = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi)
    ).normalize();
    createBranch(rootNode, direction, 1, 0.9, 1.0);
  }

  const leafNodes = nodes.filter(n => n.level >= 2);
  for (const node of leafNodes) {
    const nearby = leafNodes
      .filter(n => {
        const dist = n.position.distanceTo(node.position);
        return n !== node && dist < 10 && !isConnectedTo(node, n);
      })
      .sort((a, b) => node.position.distanceTo(a.position) - node.position.distanceTo(b.position))
      .slice(0, 3);
    for (const nearNode of nearby) {
      if (Math.random() < 0.5 * densityFactor) {
        addConnection(node, nearNode, 0.5);
      }
    }
  }

  const midLevelNodes = nodes.filter(n => n.level >= 2 && n.level <= 3);
  for (const node of midLevelNodes) {
    if (Math.random() < 0.3) {
      const innerNodes = nodes.filter(n => n !== node && n.distanceFromRoot < node.distanceFromRoot * 0.6);
      if (innerNodes.length > 0) {
        const target = innerNodes[Math.floor(Math.random() * innerNodes.length)];
        if (!isConnectedTo(node, target)) {
          addConnection(node, target, 0.4);
        }
      }
    }
  }

  return { nodes, rootNode };
}

export function generateNeuralNetwork(formationIndex: number, densityFactor: number = 1.0): NeuralNetwork {
  let network: NeuralNetwork;

  switch (formationIndex % 3) {
    case 0:
      network = generateCrystallineSphere(densityFactor);
      break;
    case 1:
      network = generateHelixLattice(densityFactor);
      break;
    case 2:
      network = generateFractalWeb(densityFactor);
      break;
    default:
      network = generateCrystallineSphere(densityFactor);
  }

  if (densityFactor < 1.0) {
    const targetCount = Math.ceil(network.nodes.length * Math.max(0.3, densityFactor));
    const toKeep = new Set<NetworkNode>([network.rootNode]);
    const sortedNodes = network.nodes
      .filter(n => n !== network.rootNode)
      .sort((a, b) => {
        const scoreA = a.connections.length * (1 / (a.distanceFromRoot + 1));
        const scoreB = b.connections.length * (1 / (b.distanceFromRoot + 1));
        return scoreB - scoreA;
      });

    for (let i = 0; i < Math.min(targetCount - 1, sortedNodes.length); i++) {
      toKeep.add(sortedNodes[i]);
    }

    network.nodes = network.nodes.filter(n => toKeep.has(n));
    network.nodes.forEach(node => {
      node.connections = node.connections.filter(conn => toKeep.has(conn.node));
    });
  }

  return network;
}

export const colorPalettes = [
  [
    new THREE.Color(0x667eea),
    new THREE.Color(0x764ba2),
    new THREE.Color(0xf093fb),
    new THREE.Color(0x9d50bb),
    new THREE.Color(0x6e48aa)
  ],
  [
    new THREE.Color(0xf857a6),
    new THREE.Color(0xff5858),
    new THREE.Color(0xfeca57),
    new THREE.Color(0xff6348),
    new THREE.Color(0xff9068)
  ],
  [
    new THREE.Color(0x4facfe),
    new THREE.Color(0x00f2fe),
    new THREE.Color(0x43e97b),
    new THREE.Color(0x38f9d7),
    new THREE.Color(0x4484ce)
  ]
];
