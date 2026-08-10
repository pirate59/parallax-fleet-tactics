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

export function createShipHullGeometry(
  modelId: ShipModelId,
  materials: ShipGeometryMaterials,
  variant: ShipModelVariant = "classic",
) {
  const root = new THREE.Group();
  (variant === "detailed" ? DETAILED_BUILDERS : BUILDERS)[modelId](root, materials);
  return root;
}
