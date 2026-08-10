import * as THREE from "three";
import type { ShipModelId } from "./shipModels.ts";

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

const BUILDERS: Record<ShipModelId, (root: THREE.Group, materials: ShipGeometryMaterials) => void> = {
  hammerhead: buildHammerhead,
  archer: buildArcher,
  hulk: buildHulk,
  fighter: buildFighter,
  behemoth: buildBehemoth,
  carrier: buildCarrier,
};

export function createShipHullGeometry(modelId: ShipModelId, materials: ShipGeometryMaterials) {
  const root = new THREE.Group();
  BUILDERS[modelId](root, materials);
  return root;
}
