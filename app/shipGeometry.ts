import * as THREE from "three";
import type { ShipModelId, ShipModelVariant } from "./shipModels.ts";

export type ShipGeometryMaterials = {
  body: THREE.Material;
  dark: THREE.Material;
  accent: THREE.Material;
  glow: THREE.Material;
};

function addMesh(
  root: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.userData.pickable = true;
  root.add(mesh);
  return mesh;
}

function buildHammerhead(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.ConeGeometry(0.56, 2.8, 6), materials.body, [0, 0, 0.08], [-Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.BoxGeometry(2.62, 0.3, 0.58), materials.body, [0, 0.02, -1.02]);
  addMesh(root, new THREE.BoxGeometry(0.38, 0.58, 1.62), materials.dark, [0, 0.25, 0.12]);
  addMesh(root, new THREE.BoxGeometry(0.42, 0.48, 0.66), materials.accent, [-1.05, 0.04, -1.04], [0, 0.08, -0.08]);
  addMesh(root, new THREE.BoxGeometry(0.42, 0.48, 0.66), materials.accent, [1.05, 0.04, -1.04], [0, -0.08, 0.08]);
  addMesh(root, new THREE.IcosahedronGeometry(0.32, 0), materials.accent, [0, 0.42, -0.58]);
}

function buildArcher(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.ConeGeometry(0.42, 3.55, 6), materials.body, [0, 0, 0.08], [-Math.PI / 2, 0, 0], [0.9, 1, 1]);
  addMesh(root, new THREE.CylinderGeometry(0.075, 0.11, 3.45, 10), materials.glow, [0, 0.12, -0.24], [-Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.BoxGeometry(1.72, 0.09, 0.52), materials.dark, [0, -0.02, 0.48], [0, 0, 0.04]);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.55, 1.65), materials.dark, [0, 0.22, 0.12]);
  addMesh(root, new THREE.OctahedronGeometry(0.26, 0), materials.accent, [0, 0.34, -0.72], [0, Math.PI / 4, 0]);
  addMesh(root, new THREE.BoxGeometry(0.16, 0.28, 0.9), materials.accent, [-0.48, 0.06, 0.42], [0, 0.18, 0]);
  addMesh(root, new THREE.BoxGeometry(0.16, 0.28, 0.9), materials.accent, [0.48, 0.06, 0.42], [0, -0.18, 0]);
}

function buildHulk(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.DodecahedronGeometry(0.96, 0), materials.body, [0, 0, 0.08], [0, 0.2, 0], [1.15, 0.76, 1.32]);
  addMesh(root, new THREE.BoxGeometry(1.96, 0.24, 0.5), materials.dark, [0, 0.02, -0.58]);
  addMesh(root, new THREE.BoxGeometry(1.82, 0.2, 0.52), materials.dark, [0, 0.02, 0.62]);
  addMesh(root, new THREE.BoxGeometry(0.46, 0.84, 1.72), materials.accent, [0, 0.2, 0.1]);
  addMesh(root, new THREE.CylinderGeometry(0.22, 0.28, 0.62, 10), materials.dark, [-0.88, 0.18, -0.42], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.CylinderGeometry(0.22, 0.28, 0.62, 10), materials.dark, [0.88, 0.18, -0.42], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.SphereGeometry(0.3, 10, 8), materials.glow, [0, 0.58, -0.3]);
}

function buildFighter(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.ConeGeometry(0.38, 2.75, 4), materials.body, [0, 0, -0.04], [-Math.PI / 2, Math.PI / 4, 0]);
  addMesh(root, new THREE.ConeGeometry(0.62, 1.72, 3), materials.dark, [-0.62, -0.04, 0.28], [-Math.PI / 2, 0, 0], [0.55, 1, 1]);
  addMesh(root, new THREE.ConeGeometry(0.62, 1.72, 3), materials.dark, [0.62, -0.04, 0.28], [-Math.PI / 2, 0, 0], [0.55, 1, 1]);
  addMesh(root, new THREE.OctahedronGeometry(0.24, 0), materials.accent, [0, 0.27, -0.5], [0, Math.PI / 4, 0], [0.72, 0.72, 1.15]);
  addMesh(root, new THREE.BoxGeometry(0.12, 0.48, 0.72), materials.dark, [0, 0.18, 0.64], [0.22, 0, 0]);
}

function buildBehemoth(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.BoxGeometry(1.28, 0.7, 3.05), materials.body, [0, 0, 0.08]);
  addMesh(root, new THREE.ConeGeometry(0.9, 1.35, 4), materials.body, [0, 0, -1.58], [-Math.PI / 2, Math.PI / 4, 0], [1.05, 1, 0.7]);
  addMesh(root, new THREE.BoxGeometry(0.62, 0.62, 2.5), materials.dark, [-0.94, -0.02, 0.18]);
  addMesh(root, new THREE.BoxGeometry(0.62, 0.62, 2.5), materials.dark, [0.94, -0.02, 0.18]);
  addMesh(root, new THREE.BoxGeometry(2.48, 0.18, 0.54), materials.accent, [0, 0.28, -0.62]);
  addMesh(root, new THREE.BoxGeometry(2.34, 0.16, 0.48), materials.accent, [0, 0.22, 0.56]);
  addMesh(root, new THREE.BoxGeometry(0.48, 0.68, 0.72), materials.dark, [0, 0.68, 0.36]);
  addMesh(root, new THREE.CylinderGeometry(0.12, 0.18, 2.8, 10), materials.glow, [-0.72, 0.2, -0.45], [-Math.PI / 2, 0, 0]);
}

function buildCarrier(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.BoxGeometry(0.72, 0.62, 2.95), materials.body, [-0.88, 0, 0.08]);
  addMesh(root, new THREE.BoxGeometry(0.72, 0.62, 2.95), materials.body, [0.88, 0, 0.08]);
  addMesh(root, new THREE.BoxGeometry(2.35, 0.24, 0.62), materials.dark, [0, 0.06, -1.12]);
  addMesh(root, new THREE.BoxGeometry(2.2, 0.3, 0.52), materials.dark, [0, 0.03, 1.18]);
  addMesh(root, new THREE.BoxGeometry(0.88, 0.06, 2.36), materials.glow, [0, -0.22, 0.08]);
  addMesh(root, new THREE.BoxGeometry(0.62, 0.52, 0.9), materials.accent, [0.78, 0.52, 0.32]);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.72, 1.24), materials.dark, [0.78, 0.74, 0.46]);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.5, 1.82), materials.accent, [-0.88, 0.34, 0.04]);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.5, 1.82), materials.accent, [0.88, 0.34, 0.04]);
}

function buildDetailedHammerhead(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildHammerhead(root, materials);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.BoxGeometry(0.72, 0.14, 0.5), materials.dark, [side * 0.88, -0.15, -1.02], [0, side * 0.08, 0]);
    addMesh(root, new THREE.BoxGeometry(0.18, 0.26, 1.28), materials.accent, [side * 0.74, 0.2, 0.05], [0, side * 0.06, 0]);
    addMesh(root, new THREE.CylinderGeometry(0.1, 0.14, 0.72, 10), materials.dark, [side * 1.22, 0.02, -1.04], [0, 0, Math.PI / 2]);
    addMesh(root, new THREE.BoxGeometry(0.08, 0.18, 0.55), materials.glow, [side * 0.46, 0.34, 0.46]);
  });
  [-0.7, -0.2, 0.3, 0.8].forEach((z, index) => {
    addMesh(root, new THREE.BoxGeometry(0.66 - index * 0.06, 0.055, 0.32), index % 2 ? materials.dark : materials.accent, [0, 0.5, z]);
  });
  addMesh(root, new THREE.BoxGeometry(1.9, 0.08, 0.2), materials.glow, [0, -0.17, -1.17]);
  addMesh(root, new THREE.CylinderGeometry(0.05, 0.07, 0.65, 8), materials.accent, [0, 0.82, 0.32]);
  addMesh(root, new THREE.SphereGeometry(0.1, 10, 8), materials.glow, [0, 1.14, 0.32]);
}

function buildDetailedArcher(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildArcher(root, materials);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.BoxGeometry(0.15, 0.12, 2.55), materials.accent, [side * 0.3, 0.09, -0.2]);
    addMesh(root, new THREE.CylinderGeometry(0.065, 0.085, 2.7, 10), materials.dark, [side * 0.2, 0.15, -0.75], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.42, 0.08, 0.78), materials.body, [side * 0.72, -0.02, 0.52], [0, side * 0.18, side * 0.04]);
    addMesh(root, new THREE.BoxGeometry(0.06, 0.3, 0.54), materials.glow, [side * 0.54, 0.03, 0.86]);
  });
  [-0.92, -0.22, 0.5].forEach((z) => {
    addMesh(root, new THREE.TorusGeometry(0.29, 0.045, 7, 14), materials.dark, [0, 0.12, z], [Math.PI / 2, 0, 0]);
  });
  addMesh(root, new THREE.ConeGeometry(0.18, 0.54, 8), materials.accent, [0, 0.66, 0.25]);
  addMesh(root, new THREE.CylinderGeometry(0.035, 0.05, 0.62, 8), materials.dark, [0, 0.76, 0.32], [0, 0, Math.PI / 8]);
  addMesh(root, new THREE.SphereGeometry(0.08, 10, 8), materials.glow, [0.12, 1.03, 0.38]);
}

function buildDetailedHulk(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildHulk(root, materials);
  [-1, 1].forEach((side) => {
    [-0.58, 0.02, 0.62].forEach((z, index) => {
      addMesh(root, new THREE.BoxGeometry(0.52, 0.16, 0.42), index === 1 ? materials.accent : materials.body, [side * 0.91, 0.28, z], [0, side * 0.12, side * 0.05]);
    });
    addMesh(root, new THREE.CylinderGeometry(0.09, 0.12, 0.82, 10), materials.dark, [side * 1.08, 0.32, -0.78], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.SphereGeometry(0.13, 10, 8), materials.glow, [side * 0.94, 0.48, 0.42]);
    addMesh(root, new THREE.BoxGeometry(0.12, 0.46, 0.72), materials.dark, [side * 0.72, -0.46, 0.28]);
  });
  [-0.55, 0, 0.55].forEach((x) => {
    addMesh(root, new THREE.BoxGeometry(0.34, 0.08, 0.62), materials.dark, [x, 0.77, 0.18]);
  });
  addMesh(root, new THREE.CylinderGeometry(0.22, 0.28, 0.34, 12), materials.accent, [0, 0.83, -0.4]);
  addMesh(root, new THREE.CylinderGeometry(0.07, 0.09, 0.72, 10), materials.dark, [0, 0.88, -0.72], [-Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.TorusGeometry(0.58, 0.045, 8, 18), materials.glow, [0, 0.02, 0.72], [Math.PI / 2, 0, 0]);
}

function buildDetailedFighter(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildFighter(root, materials);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.BoxGeometry(0.78, 0.055, 1.08), materials.body, [side * 0.66, -0.04, 0.1], [0, side * 0.22, side * 0.04], [1, 1, 0.72]);
    addMesh(root, new THREE.CylinderGeometry(0.04, 0.06, 1.18, 8), materials.accent, [side * 0.42, 0.02, -0.52], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.09, 0.38, 0.55), materials.dark, [side * 0.84, 0.13, 0.48], [side * 0.18, 0, 0]);
    addMesh(root, new THREE.CylinderGeometry(0.13, 0.18, 0.48, 10), materials.dark, [side * 0.46, -0.05, 0.86], [Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.CircleGeometry(0.12, 12), materials.glow, [side * 0.46, -0.05, 1.11], [0, Math.PI, 0]);
  });
  addMesh(root, new THREE.SphereGeometry(0.26, 14, 10), materials.accent, [0, 0.25, -0.38], [0, 0, 0], [0.78, 0.55, 1.2]);
  addMesh(root, new THREE.BoxGeometry(0.18, 0.07, 1.56), materials.dark, [0, -0.2, 0.06]);
}

function buildDetailedBehemoth(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildBehemoth(root, materials);
  [-1, 1].forEach((side) => {
    [-0.92, -0.2, 0.54, 1.08].forEach((z, index) => {
      addMesh(root, new THREE.BoxGeometry(0.54, 0.16, 0.48), index % 2 ? materials.dark : materials.body, [side * 1.24, 0.23, z], [0, side * 0.08, 0]);
    });
    addMesh(root, new THREE.CylinderGeometry(0.11, 0.15, 1.24, 12), materials.accent, [side * 1.22, 0.44, -1.16], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.18, 0.42, 1.84), materials.dark, [side * 0.68, -0.52, 0.28]);
    addMesh(root, new THREE.BoxGeometry(0.08, 0.2, 1.18), materials.glow, [side * 1.25, 0.12, 0.35]);
  });
  [-0.86, -0.3, 0.3, 0.86].forEach((z, index) => {
    addMesh(root, new THREE.BoxGeometry(0.76, 0.12, 0.42), index % 2 ? materials.accent : materials.dark, [0, 0.76, z]);
  });
  addMesh(root, new THREE.CylinderGeometry(0.32, 0.38, 0.3, 14), materials.dark, [0, 0.98, -0.12]);
  addMesh(root, new THREE.BoxGeometry(0.38, 0.34, 0.62), materials.accent, [0, 1.15, 0.54]);
  addMesh(root, new THREE.CylinderGeometry(0.04, 0.06, 0.7, 8), materials.dark, [0, 1.54, 0.58]);
  addMesh(root, new THREE.SphereGeometry(0.09, 10, 8), materials.glow, [0, 1.9, 0.58]);
  [-0.42, 0, 0.42].forEach((x) => {
    addMesh(root, new THREE.BoxGeometry(0.25, 0.08, 0.58), materials.glow, [x, -0.4, 1.28]);
  });
}

function buildDetailedCarrier(root: THREE.Group, materials: ShipGeometryMaterials) {
  buildCarrier(root, materials);
  [-1, 1].forEach((side) => {
    [-0.88, -0.18, 0.54].forEach((z, index) => {
      addMesh(root, new THREE.BoxGeometry(0.58, 0.1, 0.54), index === 1 ? materials.accent : materials.body, [side * 0.88, 0.41, z]);
    });
    addMesh(root, new THREE.BoxGeometry(0.18, 0.48, 2.46), materials.dark, [side * 1.28, 0, 0.08]);
    addMesh(root, new THREE.BoxGeometry(0.08, 0.28, 1.72), materials.glow, [side * 1.39, -0.02, -0.02]);
    addMesh(root, new THREE.CylinderGeometry(0.14, 0.2, 0.62, 10), materials.dark, [side * 0.9, -0.18, 1.35], [Math.PI / 2, 0, 0]);
  });
  [-0.5, 0, 0.5].forEach((z) => {
    addMesh(root, new THREE.BoxGeometry(0.92, 0.045, 0.34), materials.accent, [0, -0.29, z]);
  });
  addMesh(root, new THREE.BoxGeometry(0.52, 0.34, 0.72), materials.body, [0.72, 0.78, 0.25]);
  addMesh(root, new THREE.BoxGeometry(0.3, 0.24, 0.48), materials.accent, [0.72, 1.05, 0.16]);
  addMesh(root, new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), materials.dark, [0.72, 1.42, 0.22]);
  addMesh(root, new THREE.SphereGeometry(0.08, 10, 8), materials.glow, [0.72, 1.78, 0.22]);
  addMesh(root, new THREE.BoxGeometry(0.14, 0.08, 2.36), materials.glow, [0, -0.33, 0.08]);
}

function addWindowLine(
  root: THREE.Group,
  materials: ShipGeometryMaterials,
  positions: Array<[number, number, number]>,
  size: [number, number, number] = [0.07, 0.045, 0.12],
) {
  positions.forEach((position) => {
    addMesh(root, new THREE.SphereGeometry(0.5, 12, 8), materials.glow, position, [0, 0, 0], size);
  });
}

function addSuperEngine(
  root: THREE.Group,
  materials: ShipGeometryMaterials,
  position: [number, number, number],
  radius = 0.18,
) {
  addMesh(root, new THREE.CylinderGeometry(radius * 0.82, radius, radius * 1.8, 24), materials.dark, position, [Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.TorusGeometry(radius * 0.72, radius * 0.12, 10, 28), materials.accent, [position[0], position[1], position[2] + radius * 0.92]);
  addMesh(root, new THREE.CircleGeometry(radius * 0.62, 24), materials.glow, [position[0], position[1], position[2] + radius * 0.94], [0, Math.PI, 0]);
}

function buildSuperHammerhead(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.SphereGeometry(1, 32, 18), materials.body, [0, 0, 0.12], [0, 0, 0], [0.62, 0.4, 1.36]);
  addMesh(root, new THREE.ConeGeometry(0.72, 1.55, 32), materials.body, [0, 0, -1.26], [-Math.PI / 2, 0, 0], [1, 0.9, 0.68]);
  addMesh(root, new THREE.CylinderGeometry(0.22, 0.32, 2.72, 24), materials.body, [0, 0.02, -0.92], [0, 0, Math.PI / 2], [1, 1, 0.88]);
  addMesh(root, new THREE.CylinderGeometry(0.18, 0.25, 2.42, 24), materials.accent, [0, 0.08, -0.92], [0, 0, Math.PI / 2], [1, 1, 0.88]);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.SphereGeometry(0.5, 24, 14), materials.body, [side * 1.2, 0.02, -0.94], [0, side * 0.12, 0], [0.68, 0.55, 1.08]);
    addMesh(root, new THREE.ConeGeometry(0.2, 0.9, 20), materials.dark, [side * 1.25, -0.02, -1.48], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.SphereGeometry(0.34, 24, 14), materials.accent, [side * 0.54, 0.18, -0.42], [0, 0, 0], [0.62, 0.3, 1.2]);
    addMesh(root, new THREE.BoxGeometry(0.08, 0.12, 1.4), materials.glow, [side * 0.48, 0.28, 0.12], [0, side * 0.08, 0]);
    addSuperEngine(root, materials, [side * 0.38, -0.04, 1.12], 0.2);
  });
  addMesh(root, new THREE.SphereGeometry(0.38, 28, 16), materials.dark, [0, 0.48, -0.28], [0, 0, 0], [0.78, 0.55, 1.08]);
  addMesh(root, new THREE.SphereGeometry(0.3, 28, 16), materials.accent, [0, 0.55, -0.38], [0, 0, 0], [0.76, 0.38, 0.9]);
  addWindowLine(root, materials, [[-0.18, 0.61, -0.58], [-0.06, 0.63, -0.62], [0.06, 0.63, -0.62], [0.18, 0.61, -0.58]]);
  [-0.45, 0.05, 0.54].forEach((z) => addMesh(root, new THREE.TorusGeometry(0.49, 0.025, 8, 32), materials.dark, [0, 0, z], [Math.PI / 2, 0, 0]));
}

function buildSuperArcher(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.CapsuleGeometry(0.38, 2.5, 10, 24), materials.body, [0, 0, 0.08], [Math.PI / 2, 0, 0], [1, 0.88, 1]);
  addMesh(root, new THREE.ConeGeometry(0.4, 1.28, 32), materials.body, [0, 0, -1.84], [-Math.PI / 2, 0, 0], [0.95, 1, 0.76]);
  addMesh(root, new THREE.CylinderGeometry(0.055, 0.09, 3.76, 20), materials.glow, [0, 0.14, -0.28], [-Math.PI / 2, 0, 0]);
  addMesh(root, new THREE.CylinderGeometry(0.11, 0.15, 3.62, 24), materials.dark, [0, 0.12, -0.22], [-Math.PI / 2, 0, 0]);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.SphereGeometry(0.5, 24, 14), materials.body, [side * 0.55, -0.03, 0.44], [0, side * 0.22, side * 0.05], [0.75, 0.16, 1.5]);
    addMesh(root, new THREE.ConeGeometry(0.12, 2.45, 18), materials.accent, [side * 0.25, 0.13, -0.48], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.06, 0.08, 1.62), materials.glow, [side * 0.47, 0.08, 0.14], [0, side * 0.12, 0]);
    addSuperEngine(root, materials, [side * 0.31, -0.04, 1.28], 0.15);
  });
  [-1.05, -0.38, 0.3, 0.92].forEach((z) => addMesh(root, new THREE.TorusGeometry(0.22, 0.035, 10, 32), materials.accent, [0, 0.12, z], [Math.PI / 2, 0, 0]));
  addMesh(root, new THREE.SphereGeometry(0.28, 24, 14), materials.accent, [0, 0.4, 0.08], [0, 0, 0], [0.68, 0.44, 1.15]);
  addWindowLine(root, materials, [[-0.12, 0.46, -0.18], [0, 0.48, -0.22], [0.12, 0.46, -0.18]], [0.055, 0.04, 0.1]);
}

function buildSuperHulk(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.SphereGeometry(1, 36, 22), materials.body, [0, 0, 0.08], [0, 0.15, 0], [1.12, 0.72, 1.32]);
  addMesh(root, new THREE.SphereGeometry(1, 32, 20), materials.dark, [0, -0.08, 0.12], [0, 0, 0], [0.88, 0.68, 1.48]);
  addMesh(root, new THREE.SphereGeometry(1, 32, 20), materials.body, [0, 0.05, -0.12], [0, 0, 0], [1.06, 0.66, 1.16]);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.CapsuleGeometry(0.28, 0.92, 8, 20), materials.accent, [side * 0.88, 0.1, -0.16], [Math.PI / 2, 0, 0], [1, 0.9, 1]);
    addMesh(root, new THREE.SphereGeometry(0.32, 24, 14), materials.dark, [side * 0.96, 0.38, -0.34], [0, 0, 0], [1, 0.6, 1.25]);
    addMesh(root, new THREE.CylinderGeometry(0.1, 0.14, 0.92, 20), materials.dark, [side * 0.98, 0.43, -0.88], [-Math.PI / 2, 0, 0]);
    addWindowLine(root, materials, [[side * 1.02, 0.27, 0.15], [side * 1.01, 0.25, 0.38], [side * 0.97, 0.21, 0.6]], [0.045, 0.04, 0.08]);
    addSuperEngine(root, materials, [side * 0.54, -0.08, 1.04], 0.23);
  });
  [-0.62, 0, 0.62].forEach((z) => addMesh(root, new THREE.TorusGeometry(0.86, 0.035, 10, 36), materials.accent, [0, 0, z], [Math.PI / 2, 0, 0], [1, 0.72, 1]));
  addMesh(root, new THREE.SphereGeometry(0.34, 28, 16), materials.accent, [0, 0.7, -0.3], [0, 0, 0], [1, 0.5, 1.2]);
  addMesh(root, new THREE.TorusGeometry(0.42, 0.045, 10, 32), materials.glow, [0, 0.02, 1.12], [Math.PI / 2, 0, 0]);
}

function buildSuperFighter(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.CapsuleGeometry(0.28, 1.74, 10, 24), materials.body, [0, 0, -0.08], [Math.PI / 2, 0, 0], [0.9, 0.8, 1]);
  addMesh(root, new THREE.ConeGeometry(0.3, 0.98, 28), materials.body, [0, 0, -1.32], [-Math.PI / 2, 0, 0]);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.SphereGeometry(0.5, 24, 14), materials.body, [side * 0.55, -0.05, 0.14], [0, side * 0.3, side * 0.04], [1.25, 0.11, 1.55]);
    addMesh(root, new THREE.ConeGeometry(0.11, 1.68, 18), materials.accent, [side * 0.43, 0, -0.25], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.045, 0.06, 1.08), materials.glow, [side * 0.52, 0.02, 0.12], [0, side * 0.18, 0]);
    addSuperEngine(root, materials, [side * 0.32, -0.04, 0.9], 0.13);
  });
  addMesh(root, new THREE.SphereGeometry(0.3, 28, 16), materials.accent, [0, 0.25, -0.36], [0, 0, 0], [0.75, 0.48, 1.12]);
  addMesh(root, new THREE.SphereGeometry(0.22, 24, 14), materials.glow, [0, 0.28, -0.4], [0, 0, 0], [0.62, 0.34, 0.82]);
  addMesh(root, new THREE.BoxGeometry(0.08, 0.28, 0.82), materials.dark, [0, 0.14, 0.58], [0.18, 0, 0]);
  addWindowLine(root, materials, [[-0.08, 0.35, -0.46], [0, 0.36, -0.5], [0.08, 0.35, -0.46]], [0.04, 0.035, 0.06]);
}

function buildSuperBehemoth(root: THREE.Group, materials: ShipGeometryMaterials) {
  addMesh(root, new THREE.CapsuleGeometry(0.68, 2.06, 12, 28), materials.body, [0, 0, 0.08], [Math.PI / 2, 0, 0], [1.08, 0.82, 1]);
  addMesh(root, new THREE.ConeGeometry(0.76, 1.42, 32), materials.body, [0, 0, -1.6], [-Math.PI / 2, 0, 0], [1.06, 1, 0.74]);
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.CapsuleGeometry(0.36, 1.86, 10, 24), materials.dark, [side * 0.9, -0.05, 0.2], [Math.PI / 2, 0, 0], [1, 0.86, 1]);
    addMesh(root, new THREE.SphereGeometry(0.48, 28, 16), materials.body, [side * 1.06, 0.13, -0.46], [0, side * 0.1, 0], [0.82, 0.55, 1.55]);
    addMesh(root, new THREE.CylinderGeometry(0.13, 0.18, 1.34, 24), materials.accent, [side * 1.18, 0.4, -0.98], [-Math.PI / 2, 0, 0]);
    addMesh(root, new THREE.BoxGeometry(0.08, 0.16, 1.84), materials.glow, [side * 1.18, 0.12, 0.24]);
    addSuperEngine(root, materials, [side * 0.9, -0.08, 1.42], 0.3);
  });
  [-0.9, -0.25, 0.42, 1.02].forEach((z) => addMesh(root, new THREE.TorusGeometry(0.65, 0.035, 10, 36), materials.accent, [0, 0, z], [Math.PI / 2, 0, 0], [1.08, 0.82, 1]));
  addMesh(root, new THREE.SphereGeometry(0.48, 30, 18), materials.dark, [0, 0.75, 0.18], [0, 0, 0], [1, 0.58, 1.15]);
  addMesh(root, new THREE.SphereGeometry(0.34, 28, 16), materials.accent, [0, 0.88, 0.02], [0, 0, 0], [1, 0.5, 1]);
  addWindowLine(root, materials, [[-0.25, 0.93, -0.18], [-0.12, 0.98, -0.24], [0, 1, -0.26], [0.12, 0.98, -0.24], [0.25, 0.93, -0.18]]);
  addMesh(root, new THREE.TorusGeometry(0.28, 0.05, 12, 32), materials.glow, [0, 0.76, -0.58], [Math.PI / 2, 0, 0]);
}

function buildSuperCarrier(root: THREE.Group, materials: ShipGeometryMaterials) {
  [-1, 1].forEach((side) => {
    addMesh(root, new THREE.CapsuleGeometry(0.4, 2.12, 12, 26), materials.body, [side * 0.82, 0, 0.08], [Math.PI / 2, 0, 0], [1, 0.92, 1]);
    addMesh(root, new THREE.SphereGeometry(0.52, 28, 16), materials.accent, [side * 0.84, 0.17, -0.36], [0, side * 0.06, 0], [0.92, 0.5, 1.62]);
    addMesh(root, new THREE.BoxGeometry(0.12, 0.42, 2.42), materials.dark, [side * 1.18, 0, 0.1]);
    addMesh(root, new THREE.BoxGeometry(0.06, 0.22, 1.82), materials.glow, [side * 1.25, -0.02, 0.08]);
    addWindowLine(root, materials, [[side * 0.76, 0.39, -0.78], [side * 0.76, 0.4, -0.5], [side * 0.76, 0.4, -0.22], [side * 0.76, 0.4, 0.06], [side * 0.76, 0.39, 0.34]], [0.045, 0.035, 0.08]);
    addSuperEngine(root, materials, [side * 0.82, -0.05, 1.38], 0.26);
  });
  addMesh(root, new THREE.CylinderGeometry(0.2, 0.28, 2.15, 24), materials.dark, [0, 0.06, -0.96], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.CylinderGeometry(0.18, 0.24, 2, 24), materials.accent, [0, 0.02, 1.06], [0, 0, Math.PI / 2]);
  addMesh(root, new THREE.BoxGeometry(0.82, 0.08, 2.36), materials.glow, [0, -0.3, 0.08]);
  addMesh(root, new THREE.BoxGeometry(0.64, 0.06, 2.2), materials.dark, [0, -0.35, 0.08]);
  addMesh(root, new THREE.SphereGeometry(0.4, 28, 16), materials.body, [0.65, 0.58, 0.12], [0, 0, 0], [0.8, 0.72, 1.35]);
  addMesh(root, new THREE.SphereGeometry(0.3, 26, 14), materials.accent, [0.64, 0.74, -0.06], [0, 0, 0], [0.76, 0.5, 1]);
  addWindowLine(root, materials, [[0.48, 0.78, -0.28], [0.58, 0.83, -0.33], [0.68, 0.83, -0.33], [0.78, 0.78, -0.28]], [0.055, 0.04, 0.08]);
}

function addAntennaMast(
  root: THREE.Group,
  materials: ShipGeometryMaterials,
  position: [number, number, number],
  height: number,
  lean = 0,
) {
  addMesh(root, new THREE.CylinderGeometry(0.022, 0.04, height, 10), materials.dark, [position[0], position[1] + height / 2, position[2]], [0, 0, lean]);
  addMesh(root, new THREE.SphereGeometry(0.055, 14, 10), materials.glow, [position[0] - Math.sin(lean) * height, position[1] + Math.cos(lean) * height, position[2]]);
}

function addVentBank(
  root: THREE.Group,
  materials: ShipGeometryMaterials,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  width = 0.42,
) {
  addMesh(root, new THREE.BoxGeometry(width, 0.055, 0.28), materials.dark, position, rotation);
  [-0.1, 0, 0.1].forEach((offset) => {
    addMesh(root, new THREE.BoxGeometry(width * 0.76, 0.018, 0.025), materials.accent, [position[0], position[1] + 0.035, position[2] + offset], rotation);
  });
}

function addSuperIntricacy(root: THREE.Group, materials: ShipGeometryMaterials, modelId: ShipModelId) {
  switch (modelId) {
    case "hammerhead": {
      [-0.72, -0.34, 0.08, 0.5].forEach((z, index) => {
        addMesh(root, new THREE.SphereGeometry(0.5, 20, 12), index % 2 ? materials.accent : materials.dark, [0, 0.42, z], [0, 0, 0], [0.78 - index * 0.06, 0.08, 0.48]);
      });
      [-1, 1].forEach((side) => {
        addMesh(root, new THREE.CylinderGeometry(0.035, 0.05, 1.7, 12), materials.accent, [side * 0.28, -0.26, -0.12], [-Math.PI / 2, 0, 0]);
        addMesh(root, new THREE.CylinderGeometry(0.06, 0.08, 0.74, 14), materials.dark, [side * 1.18, 0.2, -1.3], [-Math.PI / 2, 0, 0]);
        addVentBank(root, materials, [side * 0.74, 0.26, 0.52], [0, side * 0.08, 0], 0.34);
      });
      addAntennaMast(root, materials, [0, 0.68, 0.22], 0.48);
      addAntennaMast(root, materials, [-0.18, 0.6, 0.4], 0.3, -0.15);
      break;
    }
    case "archer": {
      [-1.32, -0.94, -0.56, -0.18, 0.2, 0.58].forEach((z, index) => {
        addMesh(root, new THREE.TorusGeometry(0.18 + (index % 2) * 0.025, 0.022, 10, 28), index % 2 ? materials.glow : materials.accent, [0, 0.14, z], [Math.PI / 2, 0, 0]);
      });
      [-1, 1].forEach((side) => {
        [-0.48, 0.12, 0.72].forEach((z) => addMesh(root, new THREE.BoxGeometry(0.36, 0.035, 0.18), materials.dark, [side * 0.56, -0.08, z], [0, side * 0.2, side * 0.06]));
        addMesh(root, new THREE.CylinderGeometry(0.026, 0.038, 2.5, 10), materials.glow, [side * 0.16, 0.25, -0.38], [-Math.PI / 2, 0, 0]);
      });
      addVentBank(root, materials, [0, 0.35, 0.7], [0, 0, 0], 0.34);
      addAntennaMast(root, materials, [0.15, 0.42, 0.36], 0.42, 0.12);
      break;
    }
    case "hulk": {
      [-0.7, -0.24, 0.24, 0.7].forEach((z, row) => {
        [-1, 1].forEach((side) => {
          addMesh(root, new THREE.SphereGeometry(0.5, 20, 12), row % 2 ? materials.dark : materials.accent, [side * 0.84, 0.34, z], [0, side * 0.16, 0], [0.5, 0.12, 0.44]);
        });
      });
      [-1, 1].forEach((side) => {
        [-0.56, 0, 0.56].forEach((z) => addMesh(root, new THREE.CylinderGeometry(0.055, 0.08, 0.46, 14), materials.dark, [side * 1.08, 0.44, z - 0.2], [-Math.PI / 2, 0, 0]));
        addVentBank(root, materials, [side * 0.5, 0.62, 0.58], [0, side * 0.08, 0], 0.32);
      });
      addMesh(root, new THREE.TorusGeometry(0.62, 0.028, 10, 36), materials.glow, [0, -0.34, 0.34], [Math.PI / 2, 0, 0], [1.16, 0.8, 1]);
      addAntennaMast(root, materials, [0, 0.78, 0.2], 0.36);
      break;
    }
    case "fighter": {
      [-1, 1].forEach((side) => {
        addMesh(root, new THREE.ConeGeometry(0.055, 1.22, 14), materials.dark, [side * 0.72, 0.04, -0.32], [-Math.PI / 2, 0, 0]);
        addMesh(root, new THREE.BoxGeometry(0.3, 0.03, 0.48), materials.accent, [side * 0.84, 0.02, 0.34], [0, side * 0.26, side * 0.08]);
        addMesh(root, new THREE.BoxGeometry(0.035, 0.18, 0.54), materials.dark, [side * 0.58, 0.15, 0.55], [side * 0.18, 0, 0]);
        addVentBank(root, materials, [side * 0.22, 0.18, 0.42], [0, side * 0.12, 0], 0.2);
      });
      [-0.45, -0.08, 0.3].forEach((z) => addMesh(root, new THREE.TorusGeometry(0.18, 0.015, 8, 24), materials.accent, [0, 0.04, z], [Math.PI / 2, 0, 0]));
      addAntennaMast(root, materials, [0, 0.38, 0.12], 0.2, 0.08);
      break;
    }
    case "behemoth": {
      [-1, 1].forEach((side) => {
        [-0.98, -0.52, -0.06, 0.4, 0.86].forEach((z, index) => {
          addMesh(root, new THREE.SphereGeometry(0.5, 22, 12), index % 2 ? materials.body : materials.accent, [side * 0.7, 0.58, z], [0, side * 0.12, 0], [0.58, 0.11, 0.36]);
          addMesh(root, new THREE.CylinderGeometry(0.035, 0.05, 0.24, 12), materials.glow, [side * 1.18, 0.34, z], [-Math.PI / 2, 0, 0]);
        });
        addVentBank(root, materials, [side * 0.82, 0.68, 0.76], [0, side * 0.08, 0], 0.42);
        addMesh(root, new THREE.CylinderGeometry(0.08, 0.12, 1.12, 18), materials.dark, [side * 0.52, 0.88, -0.68], [-Math.PI / 2, 0, 0]);
      });
      [-0.38, 0, 0.38].forEach((x) => {
        addMesh(root, new THREE.CylinderGeometry(0.14, 0.18, 0.18, 18), materials.dark, [x, 0.92, 0.34]);
        addMesh(root, new THREE.CylinderGeometry(0.04, 0.06, 0.62, 12), materials.accent, [x, 1.02, 0.02], [-Math.PI / 2, 0, 0]);
      });
      addAntennaMast(root, materials, [0, 1.06, 0.48], 0.62);
      addAntennaMast(root, materials, [-0.28, 0.98, 0.64], 0.38, -0.14);
      addAntennaMast(root, materials, [0.28, 0.98, 0.64], 0.38, 0.14);
      break;
    }
    case "carrier": {
      [-1, 1].forEach((side) => {
        [-0.92, -0.48, -0.04, 0.4, 0.84].forEach((z, index) => {
          addMesh(root, new THREE.BoxGeometry(0.5, 0.055, 0.26), index % 2 ? materials.dark : materials.accent, [side * 0.82, 0.42, z], [0, side * 0.06, 0]);
          addMesh(root, new THREE.BoxGeometry(0.045, 0.16, 0.16), materials.glow, [side * 1.26, -0.02, z]);
        });
        addMesh(root, new THREE.TorusGeometry(0.3, 0.025, 10, 30), materials.accent, [side * 0.82, -0.12, 0.08], [Math.PI / 2, 0, 0], [1, 1, 3.4]);
        addVentBank(root, materials, [side * 0.82, 0.42, 1.04], [0, side * 0.08, 0], 0.42);
        addMesh(root, new THREE.BoxGeometry(0.22, 0.08, 2.44), materials.dark, [side * 0.48, -0.31, 0.08]);
      });
      [-0.34, -0.12, 0.12, 0.34].forEach((x) => {
        addMesh(root, new THREE.BoxGeometry(0.05, 0.025, 2.04), materials.glow, [x, -0.27, 0.08]);
      });
      addMesh(root, new THREE.CylinderGeometry(0.16, 0.22, 0.24, 20), materials.dark, [0.64, 0.98, 0.06]);
      addAntennaMast(root, materials, [0.64, 1.08, 0.08], 0.58);
      addAntennaMast(root, materials, [0.48, 0.94, 0.38], 0.34, -0.16);
      break;
    }
  }
}

const BUILDERS: Record<ShipModelId, (root: THREE.Group, materials: ShipGeometryMaterials) => void> = {
  hammerhead: buildHammerhead,
  archer: buildArcher,
  hulk: buildHulk,
  fighter: buildFighter,
  behemoth: buildBehemoth,
  carrier: buildCarrier,
};

const DETAILED_BUILDERS: Record<ShipModelId, (root: THREE.Group, materials: ShipGeometryMaterials) => void> = {
  hammerhead: buildDetailedHammerhead,
  archer: buildDetailedArcher,
  hulk: buildDetailedHulk,
  fighter: buildDetailedFighter,
  behemoth: buildDetailedBehemoth,
  carrier: buildDetailedCarrier,
};

const SUPER_BUILDERS: Record<ShipModelId, (root: THREE.Group, materials: ShipGeometryMaterials) => void> = {
  hammerhead: buildSuperHammerhead,
  archer: buildSuperArcher,
  hulk: buildSuperHulk,
  fighter: buildSuperFighter,
  behemoth: buildSuperBehemoth,
  carrier: buildSuperCarrier,
};

export function createShipHullGeometry(
  modelId: ShipModelId,
  materials: ShipGeometryMaterials,
  variant: ShipModelVariant = "classic",
) {
  const root = new THREE.Group();
  const builders = variant === "super" ? SUPER_BUILDERS : variant === "detailed" ? DETAILED_BUILDERS : BUILDERS;
  builders[modelId](root, materials);
  if (variant === "super") addSuperIntricacy(root, materials, modelId);
  return root;
}
