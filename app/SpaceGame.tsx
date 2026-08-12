"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  STORY_GATE_COUNT,
  createFortuneMap,
  pickSalvageOptions,
  pickStoryEncounter,
  rollStoryOutcome,
  type SalvageOption,
  type StoryEffect,
  type StoryEncounter,
  type StoryOutcome,
} from "./storyEngine";
import {
  clampShipMovementToRange,
  destinationFromShipMovement,
  shipMovementFromDestination,
  shipQuaternionForRotation,
  type ShipRelativeMovement,
} from "./maneuverEngine";
import {
  FLIGHT_MODE_ORDER,
  FLIGHT_MODE_RULES,
  fireStateForMode,
  movementLimitFor,
  salvosForOrder,
  type FlightMode,
} from "./orderRules";
import {
  SHIELD_FACES,
  passiveWeaponProfilesFor,
  shotSolutionForWeapon,
  weaponLocalOriginFor,
  weaponOriginFor,
  weaponProfilesFor,
  type CombatShotEvent,
  type ShieldFace,
  type Shields,
  type Team,
  type Vec3,
} from "./combatEngine";
import {
  SHIP_ARCHETYPES,
  STORY_STARTER_ARCHETYPE,
  createWeaponMount,
  durabilityForArchetype,
  isEliteWeaponKind,
  modelScaleForArchetype,
  type EliteWeaponKind,
  type ShipArchetype,
} from "./shipCatalog";
import {
  SHIP_MODEL_VARIANTS,
  shipModelProfileFor,
  type ShipModelVariant,
} from "./shipModels";
import { createShipHullGeometry } from "./shipGeometry";
import { isDisposableCarrierFighter } from "./carrierEngine";
import {
  AI_DOCTRINE_ORDER,
  AI_DOCTRINE_RULES,
  carrierWingTargetAssignments,
  generateAiCommandOrder,
  shipConditionScore,
  type AiDoctrine,
} from "./aiCommandEngine";
import {
  AI_RECRUIT_CONTROL,
  isDirectCommandShip,
  isFleetCommitReady,
  retainStoryPlayerFleet,
} from "./fleetControl";
import {
  FISHTANK_CINEMATIC_TIMINGS,
  FISHTANK_FLEET_SIZE,
  FISHTANK_PLANNING_DELAY_MS,
  FISHTANK_RESTART_DELAY_MS,
  createFishtankFleet,
  createFishtankStatusRows,
  fishtankActivationOrder,
} from "./fishtankMode";
import {
  SHIP_SIZE_PROFILES,
  totalDurabilityMultiplier,
  type ShipSizeClass,
} from "./shipSize";
import { fleetColorFor } from "./fleetPresentation";
import { preferredTargetId } from "./targetMemory";
import { spectatorOverviewFor } from "./spectatorCamera";
import {
  clampCollisionPosition,
} from "./collisionEngine";
import {
  FLEET_BATTLEFIELD,
  FLEET_STATION_X,
  FLEET_TEAM_START_X,
  STORY_BATTLEFIELD,
  type BattlefieldBounds,
} from "./battlefieldConfig";
import {
  ANIMATION_SPEED_OPTIONS,
  DEFAULT_ANIMATION_SPEED,
  advanceAnimationElapsed,
  animationSpeedAt,
  animationSpeedIndex,
  scaledAnimationDuration,
  type AnimationSpeed,
} from "./animationSpeed";
import {
  cloneGameShips as copyShips,
  type GameMode,
  type GamePhase,
  type GameShip,
  type TurnOrder,
  type TurnResolution,
} from "./gameTypes";
import { endStateForOrder as endStateFor, finalizeTurn, resolveTurn } from "./gameEngine";
import { createShipFromArchetype } from "./shipFactory";

type Phase = GamePhase;
type GameScreen = "menu" | "battle" | "story";
type Ship = GameShip;
type Order = TurnOrder;
type Resolution = TurnResolution;
type StoryStage = "briefing" | "combat" | "salvage" | "encounter" | "outcome" | "won" | "lost";

type AudioSettings = {
  soundEnabled: boolean;
  soundVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
};

type OverlayLabelSettings = {
  showShipNames: boolean;
  showHealth: boolean;
};

type CameraCommand = {
  kind: "focus" | "reset";
  nonce: number;
  shipId?: string;
};

type CinematicShipSummary = {
  id: string;
  name: string;
  className: string;
  sizeClass: ShipSizeClass;
  team: Team;
};

type CombatFocus = {
  kind: "weapon" | "collision";
  left: CinematicShipSummary;
  right: CinematicShipSummary;
  detail: string;
};

const cinematicSummaryFor = (ship: Ship): CinematicShipSummary => ({
  id: ship.id,
  name: ship.name,
  className: ship.className,
  sizeClass: ship.sizeClass,
  team: ship.team,
});

type PendingStoryThreat = {
  id: string;
  kind: "retrieval" | "patrol" | "hunter";
  triggerGate: number;
  source: string;
};

type StoryRun = {
  stage: StoryStage;
  gate: number;
  clearedGates: number;
  salvageOptions: SalvageOption[];
  currentEncounter: StoryEncounter | null;
  selectedChoiceLabel: string;
  outcome: StoryOutcome | null;
  seenEncounterIds: string[];
  pendingThreats: PendingStoryThreat[];
  acquiredEliteIds: string[];
  fortuneMap: Record<string, string>;
  history: string[];
};

const battlefieldForMode = (mode: GameMode): BattlefieldBounds => mode === "story"
  ? STORY_BATTLEFIELD
  : FLEET_BATTLEFIELD;

const MODE_OPTIONS: Array<{
  id: GameMode;
  number: string;
  label: string;
  category: string;
  description: string;
  status: string;
}> = [
  {
    id: "story",
    number: "01",
    label: "Story Mode",
    category: "Escape campaign",
    description: "Escape hostile territory through 10 warp gates, carrying every scar, upgrade, and difficult choice forward.",
    status: "Campaign ready",
  },
  {
    id: "skirmish",
    number: "02",
    label: "Skirmish Mode",
    category: "Single engagement",
    description: "Enter a focused fleet battle and test movement, facing, and firing solutions.",
    status: "Tactical prototype ready",
  },
  {
    id: "endless",
    number: "03",
    label: "Endless Mode",
    category: "Survival",
    description: "Hold the battlespace against escalating formations for as long as your fleet lasts.",
    status: "Survival framework",
  },
  {
    id: "hardcore",
    number: "04",
    label: "Hardcore Mode",
    category: "Iron fleet",
    description: "Take command with harsher damage, no resets, and consequences that carry forward.",
    status: "Iron-fleet framework",
  },
  {
    id: "fishtank",
    number: "05",
    label: "Fishtank Mode",
    category: "AI spectator battle",
    description: "Watch two autonomous five-ship fleets plot, move, and exchange ordered fire without command input.",
    status: "Automated simulation ready",
  },
];

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  soundEnabled: true,
  soundVolume: 72,
  musicEnabled: true,
  musicVolume: 48,
};

const DEFAULT_OVERLAY_LABELS: OverlayLabelSettings = {
  showShipNames: true,
  showHealth: true,
};

const MODEL_VARIANT_OPTIONS: Record<ShipModelVariant, {
  label: string;
  shortLabel: string;
  description: string;
}> = {
  classic: {
    label: "Classic silhouettes",
    shortLabel: "Classic",
    description: "Original low-detail tactical hulls with the clearest distant silhouettes.",
  },
  detailed: {
    label: "Detailed hulls",
    shortLabel: "Detailed",
    description: "Layered armour, weapons, bays, sensors, engine structures, and illuminated surface details.",
  },
  super: {
    label: "Super graphics hulls",
    shortLabel: "Super",
    description: "Sleek high-resolution forms with textured alloy plating, internal lights, glass, and enhanced engines.",
  },
};

const TEAM_LABELS: Record<Team, string> = {
  player: "Your fleet",
  ally: "Allied NPC",
  enemy: "Corsair NPC",
};

const INITIAL_LOG = [
  "Corsair formation detected inside the Kestrel Reach.",
  "Plot a grid endpoint, set final orientation, then stage both command ships.",
];

const INITIAL_SHIPS: Ship[] = [
  createShipFromArchetype(SHIP_ARCHETYPES.hammerhead, {
    id: "hammerhead-skirmish",
    name: "Hammerhead",
    team: "player",
    controller: "player",
    position: [-FLEET_TEAM_START_X, 0, -8],
    rotation: [0, 90, 0],
  }),
  createShipFromArchetype(SHIP_ARCHETYPES.fighter, {
    id: "fighter-skirmish",
    team: "player",
    controller: "player",
    position: [-FLEET_TEAM_START_X + 1, -5, 5],
    rotation: [8, 88, -8],
  }),
  createShipFromArchetype(SHIP_ARCHETYPES.carrier, {
    id: "carrier-skirmish",
    team: "ally",
    controller: "ai",
    aiDoctrine: "standard",
    position: [-FLEET_TEAM_START_X - 3, 5, 0],
    rotation: [-5, 92, 6],
  }),
  createShipFromArchetype(SHIP_ARCHETYPES.hulk, {
    id: "hulk-skirmish",
    team: "enemy",
    controller: "ai",
    position: [FLEET_TEAM_START_X, 1, -10],
    rotation: [0, -90, 0],
  }),
  createShipFromArchetype(SHIP_ARCHETYPES.archer, {
    id: "archer-skirmish",
    team: "enemy",
    controller: "ai",
    position: [FLEET_TEAM_START_X - 1, -4, 2],
    rotation: [-4, -92, 7],
  }),
  createShipFromArchetype(SHIP_ARCHETYPES.behemoth, {
    id: "behemoth-skirmish",
    team: "enemy",
    controller: "ai",
    position: [FLEET_TEAM_START_X + 3, 6, 10],
    rotation: [7, -88, -5],
  }),
];

type StoryEnemyKind = "raider" | "frigate" | "gunship";

type StoryGateConfig = {
  name: string;
  region: string;
  threat: string;
  scale: number;
  enemies: StoryEnemyKind[];
};

const STORY_GATE_CONFIGS: StoryGateConfig[] = [
  { name: "Blacksite aperture", region: "Detention orbit", threat: "Light pursuit", scale: 0.72, enemies: ["raider"] },
  { name: "Cinder passage", region: "Industrial exclusion", threat: "Fast interceptor", scale: 0.8, enemies: ["raider"] },
  { name: "Broken compass", region: "Chartless fold", threat: "Twin contact", scale: 0.74, enemies: ["raider", "raider"] },
  { name: "Authority line", region: "Customs perimeter", threat: "Mixed patrol", scale: 0.78, enemies: ["frigate", "raider"] },
  { name: "Red lumen", region: "Corsair supply lane", threat: "Reinforced patrol", scale: 0.84, enemies: ["frigate", "raider"] },
  { name: "Dead relay", region: "Fleet communications belt", threat: "Heavy response", scale: 0.88, enemies: ["frigate", "gunship"] },
  { name: "Knife constellation", region: "Hunter cordon", threat: "Three-ship screen", scale: 0.84, enemies: ["frigate", "raider", "raider"] },
  { name: "Narrow heaven", region: "Inner defence lattice", threat: "Strike formation", scale: 0.9, enemies: ["gunship", "frigate", "raider"] },
  { name: "Last authority", region: "Territorial boundary", threat: "Elite blockade", scale: 0.97, enemies: ["gunship", "frigate", "frigate"] },
  { name: "Open dark", region: "Outer escape vector", threat: "Gate warden", scale: 1.08, enemies: ["gunship", "gunship", "frigate"] },
];

const STORY_INITIAL_LOG = [
  "The Hammerhead, HM-01, is stolen. Hostile command has sealed every registered exit.",
  "Cross ten warp gates before the retrieval fleet closes the corridor.",
];

const STORY_PLAYER_SLOTS: Array<{ position: Vec3; rotation: Vec3 }> = [
  { position: [-10, 0, 4], rotation: [0, 32, 0] },
  { position: [-11, -3, -4], rotation: [6, 42, -6] },
  { position: [-8, 3, -2], rotation: [-5, 38, 8] },
  { position: [-12, 2, 7], rotation: [4, 28, -10] },
];

const STORY_ENEMY_SLOTS: Vec3[] = [
  [9, 1, -6],
  [10, -3, 3],
  [7, 4, 7],
  [12, 3, -1],
  [8, -5, -7],
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeAngle = (angle: number) => {
  let next = angle % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return next;
};

const degrees = (value: number) => THREE.MathUtils.degToRad(value);

const forwardVector = (rotation: Vec3) => {
  const pitch = degrees(rotation[0]);
  const turnAngle = degrees(rotation[1]);
  return new THREE.Vector3(
    Math.sin(turnAngle) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(turnAngle) * Math.cos(pitch),
  ).normalize();
};

const quaternionFor = shipQuaternionForRotation;

const distanceBetween = (a: Vec3, b: Vec3) =>
  new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));

const clampDestination = (
  ship: Ship,
  destination: Vec3,
  mode: FlightMode = "normal",
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): Vec3 => {
  const origin = new THREE.Vector3(...ship.position);
  const target = new THREE.Vector3(...clampCollisionPosition(
    ship,
    destination,
    bounds.halfLength,
    bounds.halfHeight,
    bounds.halfWidth,
  ));
  const offset = target.sub(origin);
  const movementLimit = movementLimitFor(ship.maxMove, mode);
  if (offset.length() > movementLimit) offset.setLength(movementLimit);
  const result = origin.add(offset);
  return [result.x, result.y, result.z];
};

const isDestinationValid = (
  ship: Ship,
  destination: Vec3,
  mode: FlightMode = "normal",
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
) => {
  const bounded = clampCollisionPosition(ship, destination, bounds.halfLength, bounds.halfHeight, bounds.halfWidth);
  return distanceBetween(ship.position, destination) <= movementLimitFor(ship.maxMove, mode) + 0.01
    && distanceBetween(bounded, destination) <= 0.01;
};

const destinationFromManeuver = (
  ship: Ship,
  distance: number,
  turn: number,
  pitch: number,
  roll: number,
  mode: FlightMode = "normal",
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
) => {
  const finalRotation: Vec3 = [
    clamp(ship.rotation[0] + clamp(pitch, -ship.maxPitch, ship.maxPitch), -85, 85),
    normalizeAngle(ship.rotation[1] + clamp(turn, -ship.maxTurn, ship.maxTurn)),
    normalizeAngle(ship.rotation[2] + clamp(roll, -ship.maxRoll, ship.maxRoll)),
  ];
  const movementLimit = movementLimitFor(ship.maxMove, mode);
  const destination = new THREE.Vector3(...ship.position).addScaledVector(
    forwardVector(finalRotation),
    clamp(distance, 0, movementLimit),
  );
  return clampDestination(ship, [destination.x, destination.y, destination.z], mode, bounds);
};

const defaultOrderFor = (ship: Ship, ships: Ship[], bounds: BattlefieldBounds = FLEET_BATTLEFIELD): Order => {
  const defaultDistance = Math.min(ship.maxMove, ship.team === "player" ? 3 : ship.maxMove * 0.55);
  return {
    destination: destinationFromManeuver(ship, defaultDistance, 0, 0, 0, "normal", bounds),
    turn: 0,
    pitch: 0,
    roll: 0,
    targetId: preferredTargetId(ship, ships),
    fire: true,
    mode: "normal",
  };
};

const buildDrafts = (ships: Ship[], bounds: BattlefieldBounds = FLEET_BATTLEFIELD) =>
  Object.fromEntries(
    ships
      .filter((ship) => isDirectCommandShip(ship) && ship.hull > 0)
      .map((ship) => [ship.id, defaultOrderFor(ship, ships, bounds)]),
  ) as Record<string, Order>;

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function createStoryRun(): StoryRun {
  return {
    stage: "briefing",
    gate: 1,
    clearedGates: 0,
    salvageOptions: [],
    currentEncounter: null,
    selectedChoiceLabel: "",
    outcome: null,
    seenEncounterIds: [],
    pendingThreats: [],
    acquiredEliteIds: [],
    fortuneMap: createFortuneMap(),
    history: ["The Hammerhead, HM-01, removed from the Blacksite impound ring.", "Escape vector plotted: ten hostile gates."],
  };
}

function createStoryStarter() {
  const starter = copyShips([INITIAL_SHIPS[0]])[0];
  const archetype: ShipArchetype = STORY_STARTER_ARCHETYPE;
  const durability = durabilityForArchetype(archetype);
  return {
    ...starter,
    id: archetype.id,
    name: archetype.name,
    callsign: archetype.callsign,
    className: archetype.className,
    color: fleetColorFor("player", archetype.id),
    archetypeId: archetype.id,
    modelId: archetype.modelId,
    modelVariants: [...archetype.modelVariants],
    sizeClass: archetype.sizeClass,
    durabilityMultiplier: archetype.durabilityMultiplier ?? 1,
    modelScale: modelScaleForArchetype(archetype),
    weaponMounts: archetype.weaponMounts.map((mount) => ({ ...mount })),
    passiveTraits: archetype.passiveTraits?.map((trait) => ({ ...trait })),
    aiTactics: { ...archetype.aiTactics },
    turnEndAbility: archetype.turnEndAbility ? {
      ...archetype.turnEndAbility,
      launchOffsets: archetype.turnEndAbility.launchOffsets.map((offset) => [...offset] as Vec3),
    } : undefined,
    shields: { ...durability.shields },
    maxShields: { ...durability.shields },
    hull: durability.hull,
    maxHull: durability.hull,
    maxMove: archetype.maxMove,
    maxTurn: archetype.maxTurn,
    maxPitch: archetype.maxPitch,
    maxRoll: archetype.maxRoll,
    weaponRange: archetype.weaponRange,
    weaponDamage: archetype.weaponDamage,
    position: [...STORY_PLAYER_SLOTS[0].position] as Vec3,
    rotation: [...STORY_PLAYER_SLOTS[0].rotation] as Vec3,
  };
}

function createStoryEnemy(kind: StoryEnemyKind, gate: number, index: number, scale: number, threatId?: string) {
  const archetypeId = kind === "raider" ? "fighter" : kind === "frigate" ? "archer" : "hulk";
  const sourceTemplate = INITIAL_SHIPS.find((ship) => ship.archetypeId === archetypeId);
  if (!sourceTemplate) throw new Error(`Missing story enemy archetype: ${archetypeId}`);
  const template = copyShips([sourceTemplate])[0];
  const names: Record<StoryEnemyKind, string[]> = {
    raider: ["Needle", "Shrike", "Talon", "Razor"],
    frigate: ["Vandal", "Marshal", "Graven", "Palisade"],
    gunship: ["Maraud", "Anvil", "Ruin", "Warden"],
  };
  const shields = Object.fromEntries(
    SHIELD_FACES.map((face) => [face, Math.max(12, Math.round(template.maxShields[face] * scale))]),
  ) as Shields;
  const hull = Math.max(42, Math.round(template.maxHull * scale));
  const damageScale = 0.72 + scale * 0.25;
  const slot = STORY_ENEMY_SLOTS[index % STORY_ENEMY_SLOTS.length];
  const suffix = String(gate * 10 + index + 1).padStart(2, "0");
  return {
    ...template,
    id: threatId ? `story-g${gate}-threat-${threatId}` : `story-g${gate}-${kind}-${index}`,
    name: threatId ? `${names[kind][3]}-${suffix}` : `${names[kind][index % names[kind].length]}-${suffix}`,
    callsign: threatId ? `PUR-${suffix}` : `WG-${suffix}`,
    className: threatId ? `Pursuit ${template.className.toLowerCase()}` : template.className,
    team: "enemy" as Team,
    controller: "ai" as const,
    color: fleetColorFor("enemy", `${archetypeId}-${index}`),
    position: [...slot] as Vec3,
    rotation: [index % 2 ? -5 : 3, -118 - index * 8, index % 2 ? 6 : -4] as Vec3,
    shields,
    maxShields: { ...shields },
    weaponMounts: template.weaponMounts.map((mount) => ({ ...mount })),
    hull,
    maxHull: hull,
    weaponDamage: Math.max(15, Math.round(template.weaponDamage * damageScale)),
    weaponRange: Math.max(12, template.weaponRange - (scale < 0.8 ? 1 : 0)),
  };
}

function createRecruitShip(kind: "scout" | "escort" | "gunboat", currentShips: Ship[]) {
  const archetypeId = kind === "scout" ? "fighter" : kind === "escort" ? "archer" : "hulk";
  const sourceTemplate = INITIAL_SHIPS.find((ship) => ship.archetypeId === archetypeId);
  if (!sourceTemplate) throw new Error(`Missing recruit archetype: ${archetypeId}`);
  const template = copyShips([sourceTemplate])[0];
  const index = currentShips.filter((ship) => ship.id.startsWith(`recruit-${kind}`)).length + 1;
  const names = { scout: "Morrow", escort: "Vesper", gunboat: "Bastion" } as const;
  const slot = STORY_PLAYER_SLOTS[Math.min(currentShips.filter((ship) => ship.team === "player").length, STORY_PLAYER_SLOTS.length - 1)];
  return {
    ...template,
    id: `recruit-${kind}-${index}`,
    name: `${names[kind]}-${index}`,
    callsign: `VOL-${String(index).padStart(2, "0")}`,
    className: `Volunteer ${template.className.toLowerCase()}`,
    team: "player" as Team,
    ...AI_RECRUIT_CONTROL,
    color: fleetColorFor("player", `${archetypeId}-${index}`),
    position: [...slot.position] as Vec3,
    rotation: [...slot.rotation] as Vec3,
  };
}

function prepareStoryBattle(fleet: Ship[], gate: number, pendingThreats: PendingStoryThreat[]) {
  const config = STORY_GATE_CONFIGS[gate - 1] ?? STORY_GATE_CONFIGS[STORY_GATE_CONFIGS.length - 1];
  const playerFleet = retainStoryPlayerFleet(copyShips(fleet))
    .filter((ship) => ship.hull > 0)
    .map((ship, index) => {
      const slot = STORY_PLAYER_SLOTS[index % STORY_PLAYER_SLOTS.length];
      return {
        ...ship,
        fighterReserveRemaining: ship.turnEndAbility?.fighterReserve,
        position: [...slot.position] as Vec3,
        rotation: [...slot.rotation] as Vec3,
      };
    });
  const enemies = config.enemies.map((kind, index) => createStoryEnemy(kind, gate, index, config.scale));
  const triggeredThreats = pendingThreats.filter((threat) => threat.triggerGate <= gate);
  const remainingThreats = pendingThreats.filter((threat) => threat.triggerGate > gate);
  const pursuitEnemies = triggeredThreats.map((threat, index) => {
    const kind: StoryEnemyKind = threat.kind === "patrol" ? "raider" : threat.kind === "retrieval" ? "frigate" : "gunship";
    return createStoryEnemy(kind, gate, enemies.length + index, Math.min(1, 0.72 + gate * 0.025), threat.id);
  });
  return { ships: [...playerFleet, ...enemies, ...pursuitEnemies], remainingThreats, triggeredThreats, config };
}

function applyStoryEffects(sourceShips: Ship[], effects: StoryEffect[], gate: number, source: string) {
  const nextShips = copyShips(sourceShips).filter((ship) => ship.team !== "enemy");
  const threats: PendingStoryThreat[] = [];
  const flagship = () => nextShips.find((ship) => ship.team === "player" && ship.hull > 0) ?? nextShips.find((ship) => ship.team === "player");

  effects.forEach((effect, effectIndex) => {
    const ship = flagship();
    if (effect.kind === "recruit") {
      if (nextShips.filter((candidate) => candidate.team === "player" && candidate.hull > 0).length < 4) {
        nextShips.push(createRecruitShip(effect.ship, nextShips));
      } else if (ship) {
        const shieldLimit = 320 * totalDurabilityMultiplier(ship.sizeClass, ship.durabilityMultiplier);
        SHIELD_FACES.forEach((face) => {
          ship.maxShields[face] = clamp(ship.maxShields[face] + 16, 1, shieldLimit);
          ship.shields[face] = Math.min(ship.maxShields[face], ship.shields[face] + 16);
        });
      }
      return;
    }
    if (effect.kind === "threat") {
      threats.push({
        id: `${source}-${effect.threat}-${gate}-${effectIndex}`,
        kind: effect.threat,
        triggerGate: Math.min(STORY_GATE_COUNT, gate + Math.max(1, effect.delay)),
        source,
      });
      return;
    }
    if (!ship) return;
    if (effect.kind === "shield") {
      const shieldLimit = 320 * totalDurabilityMultiplier(ship.sizeClass, ship.durabilityMultiplier);
      SHIELD_FACES.forEach((face) => {
        if (effect.amount > 0) {
          ship.maxShields[face] = clamp(ship.maxShields[face] + effect.amount, 1, shieldLimit);
          ship.shields[face] = Math.min(ship.maxShields[face], ship.shields[face] + effect.amount);
        } else {
          ship.shields[face] = clamp(ship.shields[face] + effect.amount, 0, ship.maxShields[face]);
        }
      });
      return;
    }
    if (effect.kind === "hull") {
      ship.hull = clamp(ship.hull + effect.amount, 0, ship.maxHull);
      return;
    }
    if (effect.kind === "eliteWeapon") {
      if (!ship.weaponMounts.some((mount) => mount.weaponKind === effect.weapon)) {
        ship.weaponMounts.push(createWeaponMount(effect.weapon, ship.weaponMounts));
      }
      return;
    }
    if (effect.stat === "weaponDamage") ship.weaponDamage = clamp(ship.weaponDamage + effect.amount, 12, 180);
    if (effect.stat === "weaponRange") ship.weaponRange = clamp(ship.weaponRange + effect.amount, 8, 80);
    if (effect.stat === "maxMove") ship.maxMove = clamp(ship.maxMove + effect.amount, 3, 24);
    if (effect.stat === "maxHull") {
      const durabilityScale = totalDurabilityMultiplier(ship.sizeClass, ship.durabilityMultiplier);
      ship.maxHull = clamp(ship.maxHull + effect.amount, 60 * durabilityScale, 420 * durabilityScale);
      ship.hull = Math.min(ship.hull, ship.maxHull);
    }
  });

  return { ships: nextShips, threats };
}

type ShipHudHandle = {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D;
  lastKey: string;
  enabled: boolean;
};

function hullHealthColor(ratio: number) {
  if (ratio <= 0.3) return "#ff6d79";
  if (ratio <= 0.6) return "#ffb85a";
  return "#61e9bd";
}

function updateShipHud(handle: ShipHudHandle, ship: Ship, labels: OverlayLabelSettings) {
  const key = `${ship.name}|${ship.color}|${ship.hull}|${ship.maxHull}|${labels.showShipNames}|${labels.showHealth}`;
  if (handle.lastKey === key) return;
  handle.lastKey = key;
  handle.enabled = labels.showShipNames || labels.showHealth;

  const { context } = handle;
  const ratio = clamp(ship.hull / Math.max(1, ship.maxHull), 0, 1);
  const percentage = Math.round(ratio * 100);
  context.clearRect(0, 0, 384, 112);

  if (labels.showShipNames) {
    context.fillStyle = "rgba(5, 11, 19, 0.9)";
    context.beginPath();
    context.roundRect(8, 6, 368, 50, 11);
    context.fill();
    context.strokeStyle = ship.color;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#eff9ff";
    context.font = "600 27px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText(ship.name.toUpperCase(), 192, 40);
  }

  if (labels.showHealth) {
    const barY = labels.showShipNames ? 66 : 28;
    const textY = labels.showShipNames ? 105 : 67;
    context.fillStyle = "rgba(5, 11, 19, 0.92)";
    context.fillRect(12, barY, 360, 18);
    context.fillStyle = hullHealthColor(ratio);
    context.fillRect(12, barY, 360 * ratio, 18);
    context.strokeStyle = "rgba(223, 244, 252, 0.46)";
    context.lineWidth = 2;
    context.strokeRect(12, barY, 360, 18);

    context.font = "600 17px ui-monospace, monospace";
    context.textAlign = "left";
    context.fillStyle = "#9eb8c5";
    context.fillText("HULL", 12, textY);
    context.textAlign = "right";
    context.fillStyle = "#edf8fc";
    context.fillText(`${Math.round(ship.hull)} / ${ship.maxHull} · ${percentage}%`, 372, textY);
  }
  handle.texture.needsUpdate = true;
}

function createShipHud(ship: Ship, labels: OverlayLabelSettings) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.renderOrder = 30;
  const handle: ShipHudHandle = { sprite, texture, context, lastKey: "", enabled: true };
  updateShipHud(handle, ship, labels);
  return handle;
}

function shieldColor(value: number, maximum: number) {
  const ratio = value / Math.max(1, maximum);
  if (value <= 0) return new THREE.Color("#ff405d");
  if (ratio < 0.38) return new THREE.Color("#ffb44a");
  return new THREE.Color("#67ddff");
}

function createHullPanelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#9a9a9a";
  context.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const offset = row % 2 === 0 ? 0 : 18;
      const x = column * 48 - offset;
      const y = row * 34;
      const shade = 125 + ((row * 31 + column * 19) % 44);
      context.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      context.fillRect(x + 2, y + 2, 44, 30);
      context.strokeStyle = "rgba(24, 24, 24, 0.72)";
      context.lineWidth = 2;
      context.strokeRect(x + 1, y + 1, 46, 32);
      context.fillStyle = "rgba(220, 220, 220, 0.6)";
      context.fillRect(x + 5, y + 5, 2, 2);
      context.fillRect(x + 39, y + 25, 2, 2);
    }
  }
  context.strokeStyle = "rgba(235, 235, 235, 0.2)";
  context.lineWidth = 1;
  for (let y = 16; y < 256; y += 34) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 7);
  texture.anisotropy = 4;
  return texture;
}

function createShipGroup(ship: Ship, modelVariant: ShipModelVariant) {
  const root = new THREE.Group();
  const modelProfile = shipModelProfileFor(ship.modelId);
  root.userData.shipId = ship.id;
  root.userData.modelId = ship.modelId;
  root.userData.modelVariant = modelVariant;
  root.userData.hudOffsetMultiplier = modelProfile.hudOffsetMultiplier;
  root.scale.setScalar(ship.modelScale);

  const isSuperModel = modelVariant === "super";
  const panelTexture = isSuperModel ? createHullPanelTexture() : null;
  const bodyMaterial = isSuperModel
    ? new THREE.MeshPhysicalMaterial({
      color: ship.color,
      roughness: 0.3,
      metalness: 0.82,
      clearcoat: 0.46,
      clearcoatRoughness: 0.2,
      sheen: 0.16,
      sheenColor: new THREE.Color(ship.color).lerp(new THREE.Color("#ffffff"), 0.25),
      bumpMap: panelTexture,
      bumpScale: 0.035,
      roughnessMap: panelTexture,
      emissive: new THREE.Color(ship.color).multiplyScalar(0.1),
      emissiveIntensity: 0.72,
    })
    : new THREE.MeshStandardMaterial({
      color: ship.color,
      roughness: 0.42,
      metalness: 0.62,
      emissive: new THREE.Color(ship.color).multiplyScalar(0.08),
    });
  const darkMaterial = isSuperModel
    ? new THREE.MeshPhysicalMaterial({
      color: "#0a1420",
      roughness: 0.23,
      metalness: 0.9,
      clearcoat: 0.58,
      clearcoatRoughness: 0.15,
      bumpMap: panelTexture,
      bumpScale: 0.025,
      roughnessMap: panelTexture,
    })
    : new THREE.MeshStandardMaterial({
      color: "#172534",
      roughness: 0.35,
      metalness: 0.82,
    });
  const accentMaterial = isSuperModel
    ? new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(ship.color).lerp(new THREE.Color("#eafcff"), 0.38),
      roughness: 0.2,
      metalness: 0.88,
      clearcoat: 0.72,
      clearcoatRoughness: 0.1,
      bumpMap: panelTexture,
      bumpScale: 0.018,
      emissive: new THREE.Color(ship.color).multiplyScalar(0.16),
      emissiveIntensity: 0.85,
    })
    : new THREE.MeshStandardMaterial({
      color: new THREE.Color(ship.color).lerp(new THREE.Color("#ffffff"), 0.28),
      roughness: 0.3,
      metalness: 0.76,
      emissive: new THREE.Color(ship.color).multiplyScalar(0.12),
    });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: ship.team === "enemy" ? "#ff536b" : "#70f3ff",
    transparent: isSuperModel,
    opacity: isSuperModel ? 0.94 : 1,
    toneMapped: !isSuperModel,
  });
  root.add(createShipHullGeometry(ship.modelId, {
    body: bodyMaterial,
    dark: darkMaterial,
    accent: accentMaterial,
    glow: glowMaterial,
  }, modelVariant));

  const primaryMount = ship.weaponMounts.find((mount) => !isEliteWeaponKind(mount.weaponKind));
  if (primaryMount) {
    const hardpoint = modelProfile.weaponHardpoints[primaryMount.hardpointId] ?? modelProfile.weaponHardpoints.primary;
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.09, 0.28, 10),
      new THREE.MeshBasicMaterial({ color: ship.team === "enemy" ? "#ff8594" : "#bdf7ff" }),
    );
    muzzle.rotation.x = -Math.PI / 2;
    muzzle.position.set(...hardpoint.position);
    root.add(muzzle);
  }

  ship.weaponMounts.filter((mount) => isEliteWeaponKind(mount.weaponKind)).forEach((mount) => {
    const weapon = mount.weaponKind as EliteWeaponKind;
    const hardpoint = modelProfile.weaponHardpoints[mount.hardpointId] ?? modelProfile.weaponHardpoints.primary;
    const gunMaterial = new THREE.MeshStandardMaterial({
      color: weapon === "railgun" ? "#d9fbff" : weapon === "turret" ? "#cf9cff" : "#ffb36c",
      emissive: weapon === "railgun" ? "#477785" : weapon === "turret" ? "#5f347d" : "#7b3820",
      emissiveIntensity: 0.7,
      metalness: 0.72,
      roughness: 0.28,
    });
    if (weapon === "turret") {
      const turret = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), gunMaterial);
      turret.position.set(...hardpoint.position);
      root.add(turret);
      return;
    }
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(weapon === "flak" ? 0.085 : 0.045, weapon === "flak" ? 0.11 : 0.07, weapon === "flak" ? 0.62 : 1.05, 10),
      gunMaterial,
    );
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.set(...hardpoint.position);
    root.add(barrel);
  });

  (ship.passiveTraits ?? []).filter((trait) => trait.kind === "autonomous-turret").forEach((trait) => {
    const hardpoint = modelProfile.weaponHardpoints[trait.hardpointId] ?? modelProfile.weaponHardpoints.dorsal;
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: ship.team === "enemy" ? "#ffae72" : "#8df2d0",
      emissive: ship.team === "enemy" ? "#783b20" : "#245f55",
      emissiveIntensity: 0.72,
      metalness: 0.78,
      roughness: 0.24,
    });
    const turretRoot = new THREE.Group();
    turretRoot.position.set(...hardpoint.position);
    const housing = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), turretMaterial);
    housing.scale.y = 0.62;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.72, 10), turretMaterial);
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.z = -0.34;
    turretRoot.add(housing, barrel);
    root.add(turretRoot);
  });

  modelProfile.engineAnchors.forEach(([x, y, z]) => {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.65, 10), darkMaterial);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, y, z);
    root.add(engine);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), glowMaterial);
    glow.position.set(x, y, z + 0.34);
    glow.rotation.y = Math.PI;
    root.add(glow);
  });

  const plateGeometry = new THREE.BoxGeometry(0.48, 0.12, 0.24);
  const shieldMaterials: Partial<Record<ShieldFace, THREE.MeshStandardMaterial>> = {};
  SHIELD_FACES.forEach((face) => {
    const material = new THREE.MeshStandardMaterial({
      color: shieldColor(ship.shields[face], ship.maxShields[face]),
      emissive: shieldColor(ship.shields[face], ship.maxShields[face]).multiplyScalar(0.55),
      emissiveIntensity: 0.8,
      metalness: 0.2,
      roughness: 0.18,
      transparent: true,
      opacity: 0.82,
    });
    const plate = new THREE.Mesh(plateGeometry, material);
    const anchor = modelProfile.shieldAnchors[face];
    plate.position.set(...anchor.position);
    if (anchor.rotation) plate.rotation.set(...anchor.rotation.map(degrees) as Vec3);
    root.add(plate);
    shieldMaterials[face] = material;
  });

  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(modelProfile.selectionRadius, 0.035, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#d9f7ff", transparent: true, opacity: 0.9 }),
  );
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.userData.selectionRing = true;
  selectionRing.visible = false;
  root.add(selectionRing);

  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(modelProfile.targetRadius, 0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#ff6675", transparent: true, opacity: 0.82 }),
  );
  targetRing.rotation.x = Math.PI / 2;
  targetRing.rotation.z = Math.PI / 4;
  targetRing.userData.targetRing = true;
  targetRing.visible = false;
  root.add(targetRing);

  root.userData.shieldMaterials = shieldMaterials;
  root.userData.bodyMaterial = bodyMaterial;
  return root;
}

function disposeObject(object: THREE.Object3D) {
  const disposedTextures = new Set<THREE.Texture>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points || child instanceof THREE.Sprite) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
            value.dispose();
            disposedTextures.add(value);
          }
        });
        material.dispose();
      });
    }
  });
}

function clearGroup(group: THREE.Group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObject(child);
  });
}

function createNebulaTexture(seed: number, colors: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  let value = seed >>> 0;
  const random = () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };

  context.clearRect(0, 0, 512, 512);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 34; index += 1) {
    const x = 110 + random() * 292;
    const y = 90 + random() * 332;
    const radius = 48 + random() * 122;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const color = new THREE.Color(colors[index % colors.length]);
    const red = Math.round(color.r * 255);
    const green = Math.round(color.g * 255);
    const blue = Math.round(color.b * 255);
    gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${0.055 + random() * 0.08})`);
    gradient.addColorStop(0.42, `rgba(${red}, ${green}, ${blue}, 0.035)`);
    gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSpaceScenery() {
  const scenery = new THREE.Group();
  scenery.name = "distant-space-scenery";

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(12, 56, 40),
    new THREE.MeshStandardMaterial({
      color: "#315a72",
      emissive: "#071b2a",
      emissiveIntensity: 0.46,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  planet.position.set(-52, -10, -70);
  planet.rotation.set(0.12, -0.48, -0.08);
  scenery.add(planet);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(12.45, 56, 40),
    new THREE.MeshBasicMaterial({
      color: "#62c9eb",
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  atmosphere.position.copy(planet.position);
  scenery.add(atmosphere);

  const nightGlow = new THREE.PointLight("#55bce6", 22, 46, 2);
  nightGlow.position.set(-39, -3, -60);
  scenery.add(nightGlow);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.25, 32, 24),
    new THREE.MeshStandardMaterial({ color: "#a6a7a2", roughness: 1, metalness: 0 }),
  );
  moon.position.set(-34, 12, -62);
  scenery.add(moon);

  const moonShadow = new THREE.Mesh(
    new THREE.SphereGeometry(3.29, 32, 24, 0, Math.PI * 0.82),
    new THREE.MeshBasicMaterial({ color: "#16191f", transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
  );
  moonShadow.position.copy(moon.position);
  moonShadow.rotation.y = 0.68;
  scenery.add(moonShadow);

  const nebulaLayers = [
    { position: [49, 16, -78] as Vec3, scale: [52, 36] as const, seed: 17, colors: ["#5f42b8", "#b04497", "#325fd0"] },
    { position: [59, -4, -72] as Vec3, scale: [43, 29] as const, seed: 41, colors: ["#3d79bc", "#913f91", "#cf5b91"] },
    { position: [36, 6, -83] as Vec3, scale: [32, 48] as const, seed: 93, colors: ["#294992", "#7b3db5", "#d568a3"] },
  ];
  nebulaLayers.forEach((layer) => {
    const texture = createNebulaTexture(layer.seed, layer.colors);
    if (!texture) return;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      color: "#ffffff",
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    }));
    cloud.position.set(...layer.position);
    cloud.scale.set(layer.scale[0], layer.scale[1], 1);
    scenery.add(cloud);
  });

  return scenery;
}

function createBattlefieldGrid(bounds: BattlefieldBounds, height: number, emphasized: boolean) {
  const positions: number[] = [];
  const step = 5;
  for (let x = -bounds.halfLength; x <= bounds.halfLength + 0.01; x += step) {
    positions.push(x, height, -bounds.halfWidth, x, height, bounds.halfWidth);
  }
  for (let z = -bounds.halfWidth; z <= bounds.halfWidth + 0.01; z += step) {
    positions.push(-bounds.halfLength, height, z, bounds.halfLength, height, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: emphasized ? "#4a8ba9" : "#25465b",
      transparent: true,
      opacity: emphasized ? 0.3 : 0.12,
    }),
  );
}

function createFleetStation(team: "ally" | "enemy") {
  const station = new THREE.Group();
  const friendly = team === "ally";
  const accent = friendly ? "#47e1d1" : "#ff744f";
  const glow = friendly ? "#1d7f80" : "#8c321f";
  const inward = friendly ? 1 : -1;
  const hull = new THREE.MeshStandardMaterial({ color: "#53616b", metalness: 0.86, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: "#151d24", metalness: 0.78, roughness: 0.48 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, emissive: glow, emissiveIntensity: 1.2, metalness: 0.72, roughness: 0.26 });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 10.5, 16), hull);
  spine.rotation.z = Math.PI / 2;
  station.add(spine);
  const reactor = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 2), trim);
  station.add(reactor);

  [-2.9, 0, 2.9].forEach((x, ringIndex) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 - ringIndex * 0.18, 0.24, 10, 32), ringIndex === 1 ? trim : hull);
    ring.position.x = x;
    ring.rotation.y = Math.PI / 2;
    station.add(ring);
  });

  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    const y = Math.cos(angle) * 3.2;
    const z = Math.sin(angle) * 3.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.8, 0.48), index % 2 ? dark : hull);
    arm.position.set(index % 2 ? -1.4 : 1.4, y * 0.52, z * 0.52);
    arm.rotation.x = angle;
    station.add(arm);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), windowMaterial);
    beacon.position.set(arm.position.x, y, z);
    station.add(beacon);
  }

  const hangar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.5, 5.4), dark);
  hangar.position.x = inward * 5.3;
  station.add(hangar);
  const hangarMouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.25, 4.15), trim);
  hangarMouth.position.x = inward * 6.94;
  station.add(hangarMouth);
  [-1.45, 0, 1.45].forEach((z) => {
    const launchLight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.7), windowMaterial);
    launchLight.position.set(inward * 7.04, -1.3, z);
    station.add(launchLight);
  });

  [-1, 1].forEach((side) => {
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 2.8), dark);
    radiator.position.set(-inward * 1.4, side * 4.45, 0);
    radiator.rotation.z = side * 0.12;
    station.add(radiator);
    for (let stripe = -1; stripe <= 1; stripe += 1) {
      const panelLine = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.03, 0.08), trim);
      panelLine.position.set(radiator.position.x, radiator.position.y + side * 0.08, stripe * 0.86);
      station.add(panelLine);
    }
  });

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 4.2, 10), hull);
  antenna.position.y = 5.2;
  station.add(antenna);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.42, 20, 1, true), trim);
  dish.position.y = 7.25;
  dish.rotation.z = friendly ? -0.45 : 0.45;
  station.add(dish);

  const stationLight = new THREE.PointLight(accent, 18, 22, 2);
  stationLight.position.set(inward * 4, 0, 0);
  station.add(stationLight);
  station.userData.team = team;
  return station;
}

function addWeaponEnvelope(
  parent: THREE.Group,
  _ship: Ship,
  end: Ship,
  target: Ship | undefined,
  armed: boolean,
) {
  const envelopeRoot = new THREE.Group();
  envelopeRoot.position.set(...end.position);
  envelopeRoot.quaternion.copy(quaternionFor(end.rotation));
  [...weaponProfilesFor(end), ...passiveWeaponProfilesFor(end)].forEach((weapon, index) => {
    const isPassive = weapon.kind === "passive-turret";
    const solution = target ? shotSolutionForWeapon(end, target, weapon) : null;
    const color = isPassive ? weapon.color : !armed ? "#456779" : solution?.valid ? "#62edbd" : weapon.color;
    const muzzleOrigin = weaponLocalOriginFor(end, weapon);
    if (weapon.halfArc >= 180) {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(weapon.range, 28, 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isPassive || armed ? 0.16 : 0.06, wireframe: true, depthWrite: false }),
      );
      sphere.position.copy(muzzleOrigin);
      envelopeRoot.add(sphere);
      return;
    }
    const origin = new THREE.Vector3();
    const displayRange = weapon.range + Math.max(0, -muzzleOrigin.z);
    const halfArc = degrees(weapon.halfArc);
    const coneHeight = displayRange * Math.cos(halfArc);
    const coneRadius = displayRange * Math.sin(halfArc);
    const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true);
    const cone = new THREE.Mesh(
      coneGeometry,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: armed ? 0.04 + index * 0.012 : 0.02, side: THREE.DoubleSide, depthWrite: false }),
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.copy(origin).add(new THREE.Vector3(0, 0, -coneHeight / 2));
    const wire = new THREE.Mesh(
      coneGeometry.clone(),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: armed ? 0.25 : 0.08, wireframe: true, depthWrite: false }),
    );
    wire.rotation.copy(cone.rotation);
    wire.position.copy(cone.position);
    const centerline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([origin, origin.clone().add(new THREE.Vector3(0, 0, -displayRange))]),
      new THREE.LineDashedMaterial({ color, dashSize: 0.42, gapSize: 0.3, transparent: true, opacity: armed ? 0.68 : 0.18 }),
    );
    centerline.computeLineDistances();
    envelopeRoot.add(cone, wire, centerline);
  });
  parent.add(envelopeRoot);
}

function addCinematicBeam(group: THREE.Group, shooter: Ship, target: Ship, shot: CombatShotEvent) {
  const start = weaponOriginFor(shooter, shot.weapon);
  const end = new THREE.Vector3(...target.position);
  const vector = end.clone().sub(start);
  const length = vector.length();
  const direction = vector.clone().normalize();
  const midpoint = start.clone().addScaledVector(direction, length / 2);
  const beamColor = shot.weapon.color;
  const beamWidth = shot.weapon.kind === "flak" ? 0.24 : shot.weapon.kind === "railgun" ? 0.075 : 0.14;
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(beamWidth, beamWidth, 1, 10),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  outer.position.copy(start);
  outer.quaternion.copy(rotation);
  outer.scale.y = 0.001;
  group.add(outer);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(beamWidth * 0.24, beamWidth * 0.42, 1, 8),
    new THREE.MeshBasicMaterial({ color: "#f5fdff", transparent: true, opacity: 0.98 }),
  );
  core.position.copy(start);
  core.quaternion.copy(rotation);
  core.scale.y = 0.001;
  group.add(core);

  const muzzleFlash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.92 }),
  );
  muzzleFlash.position.copy(start);
  group.add(muzzleFlash);

  const impact = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshBasicMaterial({ color: "#fff0cf", transparent: true, opacity: 0.94 }),
  );
  impact.position.copy(end);
  impact.visible = false;
  group.add(impact);

  return { outer, core, muzzleFlash, impact, start, midpoint, direction, length };
}

type ExplosionEffect = {
  root: THREE.Group;
  flash: THREE.Mesh;
  shock: THREE.Mesh;
  particles: THREE.Points;
  velocities: Float32Array;
  startedAt: number;
  duration: number;
};

type DamageNumberEffect = {
  sprite: THREE.Sprite;
  startPosition: THREE.Vector3;
  driftDirection: THREE.Vector3;
  baseScale: THREE.Vector3;
  startedAt: number;
  duration: number;
};

function createWreck(ship: Ship, liveGroup?: THREE.Group) {
  const wreck = new THREE.Group();
  const modelProfile = shipModelProfileFor(ship.modelId);
  wreck.userData.shipId = ship.id;
  wreck.userData.spin = new THREE.Vector3(0.0012, -0.0017, 0.001);
  if (liveGroup) {
    wreck.position.copy(liveGroup.position);
    wreck.quaternion.copy(liveGroup.quaternion);
    wreck.scale.copy(liveGroup.scale);
  } else {
    wreck.position.set(...ship.position);
    wreck.quaternion.copy(quaternionFor(ship.rotation));
    wreck.scale.setScalar(ship.modelScale);
  }

  const charred = new THREE.MeshStandardMaterial({
    color: "#151a20",
    emissive: "#120504",
    emissiveIntensity: 0.65,
    roughness: 0.88,
    metalness: 0.45,
  });
  const ember = new THREE.MeshBasicMaterial({ color: "#ff6f32", transparent: true, opacity: 0.72 });
  const brokenHull = new THREE.Mesh(new THREE.ConeGeometry(0.64, 2.25, 6, 1, true), charred);
  brokenHull.rotation.x = -Math.PI / 2;
  brokenHull.rotation.z = 0.16;
  brokenHull.position.set(-0.14, 0.03, 0.18);
  brokenHull.scale.set(...modelProfile.wreck.hullScale);
  wreck.add(brokenHull);
  modelProfile.wreck.fragments.forEach((fragmentProfile) => {
    const fragment = new THREE.Mesh(new THREE.BoxGeometry(...fragmentProfile.size), charred.clone());
    fragment.position.set(...fragmentProfile.position);
    fragment.rotation.set(...fragmentProfile.rotation);
    wreck.add(fragment);
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), ember);
  core.position.set(0.08, 0.03, 0.15);
  wreck.add(core);
  return wreck;
}

function spawnExplosion(context: SceneContext, position: THREE.Vector3, color: string, scale = 1, duration = 1750) {
  const root = new THREE.Group();
  root.position.copy(position);
  root.scale.setScalar(scale);
  const flash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.82, 2),
    new THREE.MeshBasicMaterial({ color: "#fff4cf", transparent: true, opacity: 1, depthWrite: false }),
  );
  const shock = new THREE.Mesh(
    new THREE.SphereGeometry(1, 22, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, wireframe: true, depthWrite: false }),
  );
  const particleCount = 64;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
    ).normalize().multiplyScalar(1.8 + Math.random() * 4.4);
    velocities[index * 3] = direction.x;
    velocities[index * 3 + 1] = direction.y;
    velocities[index * 3 + 2] = direction.z;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: "#ff9b4d", size: 0.16, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  root.add(flash, shock, particles);
  context.explosionGroup.add(root);
  context.explosions.push({ root, flash, shock, particles, velocities, startedAt: performance.now(), duration });
}

function destroyShipVisual(context: SceneContext, ship: Ship, explosionDuration = 1750) {
  const liveGroup = context.shipGroups.get(ship.id);
  if (isDisposableCarrierFighter(ship)) {
    const position = liveGroup?.position.clone() ?? new THREE.Vector3(...ship.position);
    if (liveGroup) liveGroup.visible = false;
    const hud = context.shipHuds.get(ship.id);
    if (hud) hud.sprite.visible = false;
    spawnExplosion(context, position, ship.team === "enemy" ? "#ff536b" : "#71ebff", 1, explosionDuration);
    return;
  }
  if (context.wrecks.has(ship.id)) return;
  const wreck = createWreck(ship, liveGroup);
  context.wrecks.set(ship.id, wreck);
  context.wreckGroup.add(wreck);
  if (liveGroup) liveGroup.visible = false;
  const hud = context.shipHuds.get(ship.id);
  if (hud) hud.sprite.visible = false;
  spawnExplosion(context, wreck.position, ship.team === "enemy" ? "#ff536b" : "#71ebff", 1, explosionDuration);
}

type SceneContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  shipGroups: Map<string, THREE.Group>;
  shipHuds: Map<string, ShipHudHandle>;
  planGroup: THREE.Group;
  laserGroup: THREE.Group;
  wreckGroup: THREE.Group;
  explosionGroup: THREE.Group;
  damageGroup: THREE.Group;
  wrecks: Map<string, THREE.Group>;
  explosions: ExplosionEffect[];
  damageNumbers: DamageNumberEffect[];
  frame: number;
};

function spawnDamageNumber(
  context: SceneContext,
  position: THREE.Vector3,
  amount: number,
  kind: "shield" | "hull",
  label: string,
  horizontalOffset = 0,
  duration = 1450,
) {
  const roundedAmount = Math.max(0, Math.round(amount));
  if (roundedAmount <= 0) return;

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 128;
  const drawing = canvas.getContext("2d");
  if (!drawing) return;
  const color = kind === "shield" ? "#6bdcff" : "#ff6478";
  drawing.textAlign = "center";
  drawing.lineJoin = "round";
  drawing.font = "800 72px ui-monospace, monospace";
  drawing.lineWidth = 14;
  drawing.strokeStyle = "rgba(3, 8, 14, 0.94)";
  drawing.strokeText(`-${roundedAmount}`, 160, 76);
  drawing.fillStyle = color;
  drawing.fillText(`-${roundedAmount}`, 160, 76);
  drawing.font = "700 22px ui-monospace, monospace";
  drawing.lineWidth = 7;
  drawing.strokeText(label, 160, 112);
  drawing.fillStyle = "#f4fbff";
  drawing.fillText(label, 160, 112);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 80;
  const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(context.camera.quaternion).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(context.camera.quaternion).normalize();
  const startPosition = position.clone()
    .addScaledVector(screenRight, horizontalOffset)
    .addScaledVector(screenUp, 1.2);
  const viewportHeight = Math.max(1, context.renderer.domElement.clientHeight);
  const distance = Math.max(1, context.camera.position.distanceTo(startPosition));
  const worldPerPixel = 2 * distance * Math.tan(degrees(context.camera.fov) / 2) / viewportHeight;
  const worldHeight = clamp(worldPerPixel * 72, 0.72, 2.8);
  const baseScale = new THREE.Vector3(worldHeight * (320 / 128), worldHeight, 1);
  sprite.position.copy(startPosition);
  sprite.scale.copy(baseScale).multiplyScalar(0.78);
  context.damageGroup.add(sprite);
  context.damageNumbers.push({
    sprite,
    startPosition,
    driftDirection: screenUp,
    baseScale,
    startedAt: performance.now(),
    duration,
  });
}

type CombatVisibilitySnapshot = {
  shipGroups: Map<string, boolean>;
  shipHuds: Map<string, boolean>;
  wrecks: Map<string, boolean>;
  wreckGroup: boolean;
};

function captureCombatVisibility(context: SceneContext): CombatVisibilitySnapshot {
  return {
    shipGroups: new Map([...context.shipGroups].map(([id, group]) => [id, group.visible])),
    shipHuds: new Map([...context.shipHuds].map(([id, hud]) => [id, hud.sprite.visible])),
    wrecks: new Map([...context.wrecks].map(([id, wreck]) => [id, wreck.visible])),
    wreckGroup: context.wreckGroup.visible,
  };
}

function isolateCombatParticipants(
  context: SceneContext,
  snapshot: CombatVisibilitySnapshot,
  shooterId: string,
  targetId: string,
) {
  const participants = new Set([shooterId, targetId]);
  context.shipGroups.forEach((group, id) => {
    group.visible = participants.has(id) && (snapshot.shipGroups.get(id) ?? group.visible);
  });
  context.shipHuds.forEach((hud, id) => {
    hud.sprite.visible = participants.has(id) && (snapshot.shipHuds.get(id) ?? hud.sprite.visible);
  });
  let hasVisibleWreck = false;
  context.wrecks.forEach((wreck, id) => {
    wreck.visible = participants.has(id) && (snapshot.wrecks.get(id) ?? wreck.visible);
    if (wreck.visible) hasVisibleWreck = true;
  });
  context.wreckGroup.visible = hasVisibleWreck;
}

function restoreCombatVisibility(
  context: SceneContext,
  snapshot: CombatVisibilitySnapshot,
  destroyedIds: readonly string[],
) {
  const destroyed = new Set(destroyedIds);
  context.shipGroups.forEach((group, id) => {
    group.visible = (snapshot.shipGroups.get(id) ?? true)
      && !destroyed.has(id)
      && !context.wrecks.has(id);
  });
  context.shipHuds.forEach((hud, id) => {
    hud.sprite.visible = (snapshot.shipHuds.get(id) ?? hud.enabled)
      && !destroyed.has(id)
      && Boolean(context.shipGroups.get(id)?.visible);
  });
  context.wreckGroup.visible = snapshot.wreckGroup;
  context.wrecks.forEach((wreck, id) => {
    wreck.visible = snapshot.wrecks.get(id) ?? true;
  });
}

function overviewSubjects(ships: Ship[], includeStations: boolean) {
  if (!includeStations) return ships;
  return [
    ...ships,
    { position: [-FLEET_STATION_X, 0, 0] as Vec3, hull: 1, modelScale: 4.5 },
    { position: [FLEET_STATION_X, 0, 0] as Vec3, hull: 1, modelScale: 4.5 },
  ];
}

function TacticalScene({
  ships,
  drafts,
  staged,
  selectedShipId,
  selectedTargetId,
  resolution,
  cameraCommand,
  onSelect,
  onCombatFocus,
  onResolutionComplete,
  overlayLabels,
  animationSpeed,
  modelVariant,
  battlefieldBounds,
  showFleetStations,
  presentation = "command",
}: {
  ships: Ship[];
  drafts: Record<string, Order>;
  staged: Set<string>;
  selectedShipId: string;
  selectedTargetId: string;
  resolution: Resolution | null;
  cameraCommand: CameraCommand;
  onSelect: (id: string) => void;
  onCombatFocus: (focus: CombatFocus | null) => void;
  onResolutionComplete: (resolution: Resolution) => void;
  overlayLabels: OverlayLabelSettings;
  animationSpeed: AnimationSpeed;
  modelVariant: ShipModelVariant;
  battlefieldBounds: BattlefieldBounds;
  showFleetStations: boolean;
  presentation?: "command" | "spectator";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<SceneContext | null>(null);
  const selectRef = useRef(onSelect);
  const focusRef = useRef(onCombatFocus);
  const completeRef = useRef(onResolutionComplete);
  const overlayLabelsRef = useRef(overlayLabels);
  const animationSpeedRef = useRef<AnimationSpeed>(animationSpeed);
  const overviewViewRef = useRef(0);

  useEffect(() => {
    selectRef.current = onSelect;
    focusRef.current = onCombatFocus;
    completeRef.current = onResolutionComplete;
    overlayLabelsRef.current = overlayLabels;
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed, onSelect, onCombatFocus, onResolutionComplete, overlayLabels]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 320);
    camera.position.set(
      battlefieldBounds.halfLength * 0.95,
      battlefieldBounds.halfHeight * 2.4,
      battlefieldBounds.halfWidth * 1.15,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "Interactive 3D tactical battlefield");
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 8;
    controls.maxDistance = showFleetStations ? 170 : 70;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.HemisphereLight("#bfe9ff", "#07101b", 1.65));
    const keyLight = new THREE.DirectionalLight("#d5f2ff", 3.1);
    keyLight.position.set(-9, 15, 8);
    scene.add(keyLight);
    const enemyLight = new THREE.PointLight("#ff466a", 26, 35, 2);
    enemyLight.position.set(12, 4, -4);
    scene.add(enemyLight);

    [-battlefieldBounds.halfHeight, 0, battlefieldBounds.halfHeight].forEach((height, index) => {
      scene.add(createBattlefieldGrid(battlefieldBounds, height, index === 1));
    });

    const volume = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(
        battlefieldBounds.length,
        battlefieldBounds.height,
        battlefieldBounds.width,
      )),
      new THREE.LineBasicMaterial({ color: "#315971", transparent: true, opacity: 0.38 }),
    );
    scene.add(volume);

    if (showFleetStations) {
      const alliedStation = createFleetStation("ally");
      alliedStation.position.set(-FLEET_STATION_X, 0, 0);
      const enemyStation = createFleetStation("enemy");
      enemyStation.position.set(FLEET_STATION_X, 0, 0);
      scene.add(alliedStation, enemyStation);
    }

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      const radius = battlefieldBounds.halfLength + 32 + Math.random() * 65;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index * 3 + 1] = radius * Math.cos(phi);
      starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: "#b9dcf2", size: 0.12, transparent: true, opacity: 0.72, sizeAttenuation: true }),
    );
    scene.add(stars);
    scene.add(createSpaceScenery());

    const planGroup = new THREE.Group();
    const laserGroup = new THREE.Group();
    const wreckGroup = new THREE.Group();
    const explosionGroup = new THREE.Group();
    const damageGroup = new THREE.Group();
    scene.add(planGroup, laserGroup, wreckGroup, explosionGroup, damageGroup);

    const shipGroups = new Map<string, THREE.Group>();
    const shipHuds = new Map<string, ShipHudHandle>();
    const wrecks = new Map<string, THREE.Group>();
    const context: SceneContext = {
      scene,
      camera,
      renderer,
      controls,
      shipGroups,
      shipHuds,
      planGroup,
      laserGroup,
      wreckGroup,
      explosionGroup,
      damageGroup,
      wrecks,
      explosions: [],
      damageNumbers: [],
      frame: 0,
    };
    contextRef.current = context;

    const pointerStart = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => pointerStart.set(event.clientX, event.clientY);
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...shipGroups.values()], true);
      for (const hit of hits) {
        let current: THREE.Object3D | null = hit.object;
        while (current && !current.userData.shipId) current = current.parent;
        if (current?.userData.shipId) {
          selectRef.current(current.userData.shipId as string);
          break;
        }
      }
    };
    const stopContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("contextmenu", stopContextMenu);

    const handleKeyboardCamera = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      const panKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"];
      if (!panKeys.includes(event.key)) return;
      event.preventDefault();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const movement = new THREE.Vector3();
      if (event.key === "ArrowUp" || event.key === "w") movement.add(forward);
      if (event.key === "ArrowDown" || event.key === "s") movement.sub(forward);
      if (event.key === "ArrowRight" || event.key === "d") movement.add(right);
      if (event.key === "ArrowLeft" || event.key === "a") movement.sub(right);
      movement.multiplyScalar(0.75);
      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
    };
    window.addEventListener("keydown", handleKeyboardCamera);

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        const pixelRatio = renderer.getPixelRatio();
        if (renderer.domElement.width !== Math.round(width * pixelRatio) || renderer.domElement.height !== Math.round(height * pixelRatio)) {
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      });
    });
    resizeObserver.observe(mount);

    const hudCameraUp = new THREE.Vector3();
    const render = (time = performance.now()) => {
      if (controls.enabled) controls.update();
      const viewportHeight = Math.max(1, mount.clientHeight);
      hudCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      shipHuds.forEach((hud, id) => {
        const group = shipGroups.get(id);
        hud.sprite.visible = Boolean(group?.visible && hud.enabled);
        if (!group?.visible) return;
        const distance = camera.position.distanceTo(group.position);
        const worldPerPixel = 2 * distance * Math.tan(degrees(camera.fov) / 2) / viewportHeight;
        const worldHeight = clamp(worldPerPixel * 46, 0.36, 6.2);
        const hudOffsetMultiplier = Number(group.userData.hudOffsetMultiplier ?? 1);
        const screenUpOffset = clamp(worldPerPixel * 62, 1.65, 7.5) * hudOffsetMultiplier;
        hud.sprite.position.copy(group.position).addScaledVector(hudCameraUp, screenUpOffset);
        hud.sprite.scale.set(worldHeight * (384 / 112), worldHeight, 1);
      });
      wrecks.forEach((wreck) => {
        const spin = wreck.userData.spin as THREE.Vector3 | undefined;
        if (spin) {
          wreck.rotation.x += spin.x;
          wreck.rotation.y += spin.y;
          wreck.rotation.z += spin.z;
        }
      });
      for (let index = context.explosions.length - 1; index >= 0; index -= 1) {
        const effect = context.explosions[index];
        const progress = clamp((time - effect.startedAt) / effect.duration, 0, 1);
        const particlePositions = effect.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let particle = 0; particle < particlePositions.count; particle += 1) {
          const drag = progress * (1 - progress * 0.28);
          particlePositions.setXYZ(
            particle,
            effect.velocities[particle * 3] * drag,
            effect.velocities[particle * 3 + 1] * drag,
            effect.velocities[particle * 3 + 2] * drag,
          );
        }
        particlePositions.needsUpdate = true;
        effect.flash.scale.setScalar(1 + progress * 3.6);
        (effect.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress * 1.8);
        effect.shock.scale.setScalar(0.35 + progress * 5.6);
        (effect.shock.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.72 * (1 - progress));
        (effect.particles.material as THREE.PointsMaterial).opacity = Math.max(0, 0.95 * (1 - progress));
        if (progress >= 1) {
          context.explosionGroup.remove(effect.root);
          disposeObject(effect.root);
          context.explosions.splice(index, 1);
        }
      }
      for (let index = context.damageNumbers.length - 1; index >= 0; index -= 1) {
        const effect = context.damageNumbers[index];
        const progress = clamp((time - effect.startedAt) / effect.duration, 0, 1);
        const fade = progress < 0.12
          ? progress / 0.12
          : progress > 0.62
            ? 1 - (progress - 0.62) / 0.38
            : 1;
        effect.sprite.position.copy(effect.startPosition).addScaledVector(effect.driftDirection, progress * 1.35);
        effect.sprite.scale.copy(effect.baseScale).multiplyScalar(0.78 + Math.sin(Math.min(1, progress * 2.2) * Math.PI / 2) * 0.22);
        (effect.sprite.material as THREE.SpriteMaterial).opacity = clamp(fade, 0, 1);
        if (progress >= 1) {
          context.damageGroup.remove(effect.sprite);
          disposeObject(effect.sprite);
          context.damageNumbers.splice(index, 1);
        }
      }
      renderer.render(scene, camera);
      context.frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(context.frame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", handleKeyboardCamera);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("contextmenu", stopContextMenu);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      contextRef.current = null;
    };
  }, [battlefieldBounds, showFleetStations]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;
    const liveIds = new Set(ships.map((ship) => ship.id));
    context.shipGroups.forEach((group, id) => {
      if (!liveIds.has(id)) {
        context.scene.remove(group);
        disposeObject(group);
        context.shipGroups.delete(id);
        const hud = context.shipHuds.get(id);
        if (hud) {
          context.scene.remove(hud.sprite);
          disposeObject(hud.sprite);
          context.shipHuds.delete(id);
        }
      }
    });
    context.wrecks.forEach((wreck, id) => {
      if (!liveIds.has(id)) {
        context.wreckGroup.remove(wreck);
        disposeObject(wreck);
        context.wrecks.delete(id);
      }
    });

    ships.forEach((ship) => {
      const existingWreck = context.wrecks.get(ship.id);
      if (ship.hull > 0 && existingWreck) {
        context.wreckGroup.remove(existingWreck);
        disposeObject(existingWreck);
        context.wrecks.delete(ship.id);
      }
      let group = context.shipGroups.get(ship.id);
      if (group && group.userData.modelVariant !== modelVariant) {
        context.scene.remove(group);
        disposeObject(group);
        context.shipGroups.delete(ship.id);
        group = undefined;
      }
      if (!group) {
        group = createShipGroup(ship, modelVariant);
        context.shipGroups.set(ship.id, group);
        context.scene.add(group);
      }
      let hud = context.shipHuds.get(ship.id);
      if (!hud) {
        hud = createShipHud(ship, overlayLabels) ?? undefined;
        if (hud) {
          context.shipHuds.set(ship.id, hud);
          context.scene.add(hud.sprite);
        }
      }
      if (hud) {
        updateShipHud(hud, ship, overlayLabels);
        hud.sprite.visible = ship.hull > 0 && hud.enabled;
      }
      if (!resolution) {
        group.position.set(...ship.position);
        group.quaternion.copy(quaternionFor(ship.rotation));
      }
      group.scale.setScalar(ship.modelScale);
      group.visible = ship.hull > 0 && !context.wrecks.has(ship.id);
      group.traverse((child) => {
        if (child.userData.selectionRing) child.visible = ship.id === selectedShipId;
        if (child.userData.targetRing) child.visible = ship.id === selectedTargetId;
      });
      const materials = group.userData.shieldMaterials as Partial<Record<ShieldFace, THREE.MeshStandardMaterial>>;
      SHIELD_FACES.forEach((face) => {
        materials[face]?.color.copy(shieldColor(ship.shields[face], ship.maxShields[face]));
        materials[face]?.emissive.copy(shieldColor(ship.shields[face], ship.maxShields[face]).multiplyScalar(0.55));
      });
      if (ship.hull <= 0 && !isDisposableCarrierFighter(ship) && !context.wrecks.has(ship.id)) {
        const wreck = createWreck(ship, group);
        context.wrecks.set(ship.id, wreck);
        context.wreckGroup.add(wreck);
      }
    });

    clearGroup(context.planGroup);
    if (resolution) return;

    ships
      .filter((ship) => ship.controller === "player" && ship.hull > 0 && drafts[ship.id])
      .forEach((ship) => {
        const order = drafts[ship.id];
        const end = endStateFor(ship, order, battlefieldBounds);
        const startPoint = new THREE.Vector3(...ship.position);
        const endPoint = new THREE.Vector3(...end.position);
        const midpoint = startPoint.clone().lerp(endPoint, 0.5).add(new THREE.Vector3(0, 0.85, 0));
        const curve = new THREE.QuadraticBezierCurve3(startPoint, midpoint, endPoint);
        const path = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
          new THREE.LineDashedMaterial({
            color: staged.has(ship.id) ? "#65edc0" : "#69cfff",
            dashSize: 0.35,
            gapSize: 0.24,
            transparent: true,
            opacity: ship.id === selectedShipId ? 0.95 : 0.42,
          }),
        );
        path.computeLineDistances();
        context.planGroup.add(path);

        const ghostMaterial = new THREE.MeshBasicMaterial({
          color: ship.color,
          wireframe: true,
          transparent: true,
          opacity: ship.id === selectedShipId ? 0.82 : 0.34,
        });
        const ghost = createShipHullGeometry(ship.modelId, {
          body: ghostMaterial,
          dark: ghostMaterial,
          accent: ghostMaterial,
          glow: ghostMaterial,
        }, modelVariant);
        const ghostRoot = new THREE.Group();
        ghostRoot.position.copy(endPoint);
        ghostRoot.quaternion.copy(quaternionFor(end.rotation));
        ghostRoot.scale.setScalar(ship.modelScale);
        ghostRoot.add(ghost);
        context.planGroup.add(ghostRoot);

        if (ship.id === selectedShipId) {
          const movementLimit = movementLimitFor(ship.maxMove, order.mode);
          if (movementLimit > 0) {
            const envelope = new THREE.Mesh(
              new THREE.SphereGeometry(movementLimit, 18, 12),
              new THREE.MeshBasicMaterial({ color: order.mode === "extra-move" ? "#61e9bd" : "#4b8ba8", transparent: true, opacity: 0.1, wireframe: true, depthWrite: false }),
            );
            envelope.position.copy(startPoint);
            context.planGroup.add(envelope);
          }

          const target = ships.find((candidate) => candidate.id === order.targetId && candidate.hull > 0);
          addWeaponEnvelope(context.planGroup, ship, end, target, order.fire);
          if (target && order.fire) {
            weaponProfilesFor(end).forEach((weapon) => {
              const lock = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([weaponOriginFor(end, weapon), new THREE.Vector3(...target.position)]),
                new THREE.LineDashedMaterial({ color: weapon.color, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.58 }),
              );
              lock.computeLineDistances();
              context.planGroup.add(lock);
            });
          }
        }
      });
  }, [ships, drafts, staged, selectedShipId, selectedTargetId, resolution, overlayLabels, modelVariant, battlefieldBounds]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || !cameraCommand.nonce) return;
    if (cameraCommand.kind === "reset") {
      if (presentation === "spectator" || showFleetStations) {
        const overview = spectatorOverviewFor(
          overviewSubjects(ships, showFleetStations),
          context.camera.aspect,
          overviewViewRef.current,
        );
        context.camera.position.set(...overview.position);
        context.controls.target.set(...overview.target);
        context.camera.fov = overview.fov;
        context.camera.updateProjectionMatrix();
      } else {
        context.camera.position.set(19, 16, 22);
        context.controls.target.set(0, 0, 0);
      }
    } else {
      const ship = ships.find((candidate) => candidate.id === cameraCommand.shipId);
      if (ship) {
        const target = new THREE.Vector3(...ship.position);
        const offset = context.camera.position.clone().sub(context.controls.target).normalize().multiplyScalar(10);
        context.controls.target.copy(target);
        context.camera.position.copy(target.add(offset));
      }
    }
    context.controls.update();
  }, [cameraCommand, presentation, ships, showFleetStations]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || presentation !== "spectator" || resolution) return;
    context.controls.maxDistance = showFleetStations ? 170 : 75;
    const overview = spectatorOverviewFor(
      overviewSubjects(ships, showFleetStations),
      context.camera.aspect,
      overviewViewRef.current,
    );
    context.camera.position.set(...overview.position);
    context.controls.target.set(...overview.target);
    context.camera.fov = overview.fov;
    context.camera.updateProjectionMatrix();
    context.controls.update();
  }, [presentation, resolution, ships, showFleetStations]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || !resolution) return;
    let cancelled = false;
    let combatVisibility: CombatVisibilitySnapshot | null = null;
    const hasCinematicEvent = resolution.collisions.length > 0 || resolution.shots.some((shot) => shot.valid);
    if (hasCinematicEvent) overviewViewRef.current += 1;
    const returnOverview = presentation === "spectator" || hasCinematicEvent
      ? spectatorOverviewFor(
        overviewSubjects(resolution.endShips, false),
        context.camera.aspect,
        overviewViewRef.current,
        1.03,
      )
      : null;
    const tacticalPosition = returnOverview
      ? new THREE.Vector3(...returnOverview.position)
      : context.camera.position.clone();
    const tacticalTarget = returnOverview
      ? new THREE.Vector3(...returnOverview.target)
      : context.controls.target.clone();
    const tacticalFov = returnOverview?.fov ?? context.camera.fov;
    const scaledNow = (milliseconds: number) => scaledAnimationDuration(milliseconds, animationSpeedRef.current);
    const starts = new Map(
      ships.map((ship) => [
        ship.id,
        {
          position: new THREE.Vector3(...ship.position),
          quaternion: quaternionFor(ship.rotation),
        },
      ]),
    );

    const runTimedAnimation = (
      milliseconds: number,
      update: (progress: number) => void = () => undefined,
    ) => new Promise<void>((resolve) => {
      let elapsed = 0;
      let previous = performance.now();
      const step = (time: number) => {
        if (cancelled) {
          resolve();
          return;
        }
        const delta = clamp(time - previous, 0, 100);
        previous = time;
        elapsed = advanceAnimationElapsed(elapsed, delta, animationSpeedRef.current);
        const progress = clamp(elapsed / milliseconds, 0, 1);
        update(progress);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    const delay = (milliseconds: number) => runTimedAnimation(milliseconds);

    const tweenCamera = (position: THREE.Vector3, lookAt: THREE.Vector3, milliseconds: number) => {
      const fromPosition = context.camera.position.clone();
      const fromLook = context.controls.target.clone();
      return runTimedAnimation(milliseconds, (raw) => {
        const eased = raw * raw * (3 - 2 * raw);
        context.camera.position.lerpVectors(fromPosition, position, eased);
        const currentLook = fromLook.clone().lerp(lookAt, eased);
        context.camera.lookAt(currentLook);
        context.controls.target.copy(currentLook);
      });
    };

    const growBeam = (beam: ReturnType<typeof addCinematicBeam>, milliseconds: number) => {
      return runTimedAnimation(milliseconds, (raw) => {
        const eased = 1 - Math.pow(1 - raw, 3);
        const currentLength = Math.max(0.001, beam.length * eased);
        const currentMidpoint = beam.start.clone().addScaledVector(beam.direction, currentLength / 2);
        beam.outer.scale.y = currentLength;
        beam.core.scale.y = currentLength;
        beam.outer.position.copy(currentMidpoint);
        beam.core.position.copy(currentMidpoint);
        beam.muzzleFlash.scale.setScalar(1 + Math.sin(raw * Math.PI) * 0.9);
        beam.impact.visible = raw > 0.78;
        if (beam.impact.visible) beam.impact.scale.setScalar(0.7 + (raw - 0.78) * 2.2);
      });
    };

    const visuallyDestroyedIds = new Set<string>();
    const ensureCombatVisibility = () => {
      if (!combatVisibility) combatVisibility = captureCombatVisibility(context);
      return combatVisibility;
    };

    const finishCinematic = async () => {
      if (cancelled) return;
      focusRef.current(null);
      if (combatVisibility) {
        restoreCombatVisibility(context, combatVisibility, resolution.destroyedIds);
        combatVisibility = null;
      }
      await tweenCamera(
        tacticalPosition,
        tacticalTarget,
        presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.cameraReturn : 520,
      );
      context.camera.fov = tacticalFov;
      context.camera.updateProjectionMatrix();
      context.controls.target.copy(tacticalTarget);
      context.controls.enabled = true;
      context.controls.update();
      if (!cancelled) completeRef.current(resolution);
    };

    const playCollisions = async () => {
      if (!resolution.collisions.length) return;
      context.camera.fov = 42;
      context.camera.updateProjectionMatrix();
      const visibility = ensureCombatVisibility();

      for (const collision of resolution.collisions) {
        if (cancelled) return;
        const shipA = resolution.endShips.find((ship) => ship.id === collision.shipAId);
        const shipB = resolution.endShips.find((ship) => ship.id === collision.shipBId);
        if (!shipA || !shipB) continue;
        isolateCombatParticipants(context, visibility, shipA.id, shipB.id);
        const positionFor = (ship: Ship) => context.wrecks.get(ship.id)?.position.clone()
          ?? context.shipGroups.get(ship.id)?.position.clone()
          ?? new THREE.Vector3(...ship.position);
        const positionA = positionFor(shipA);
        const positionB = positionFor(shipB);
        const midpoint = positionA.clone().lerp(positionB, 0.5);
        const direction = positionB.clone().sub(positionA);
        if (direction.lengthSq() <= 1e-8) direction.set(0, 0, -1);
        direction.normalize();
        const upReference = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0))) > 0.92
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(direction, upReference).normalize();
        const lift = new THREE.Vector3().crossVectors(side, direction).normalize();
        const cameraDistance = clamp(positionA.distanceTo(positionB) * 1.5 + 4.5, 7, 12);
        const cameraPosition = midpoint.clone().addScaledVector(side, cameraDistance).addScaledVector(lift, 3.1);
        focusRef.current({
          kind: "collision",
          left: cinematicSummaryFor(shipA),
          right: cinematicSummaryFor(shipB),
          detail: collision.kind === "wreck"
            ? `WRECK IMPACT · ${Math.max(collision.damageToA, collision.damageToB)} DAMAGE`
            : `HULL IMPACT · ${collision.damageToA}/${collision.damageToB} DAMAGE`,
        });
        await tweenCamera(
          cameraPosition,
          midpoint,
          presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.cameraApproach : 430,
        );
        if (cancelled) return;
        spawnExplosion(context, midpoint, "#ffb45a", collision.kind === "wreck" ? 0.38 : 0.56, scaledNow(920));
        spawnDamageNumber(
          context,
          positionA,
          collision.damageToA,
          collision.hullDamageToA > 0 ? "hull" : "shield",
          collision.hullDamageToA > 0 ? "IMPACT · HULL" : "IMPACT · SHIELD",
          -0.35,
          scaledNow(presentation === "spectator" ? 1700 : 1350),
        );
        spawnDamageNumber(
          context,
          positionB,
          collision.damageToB,
          collision.hullDamageToB > 0 ? "hull" : "shield",
          collision.hullDamageToB > 0 ? "IMPACT · HULL" : "IMPACT · SHIELD",
          0.35,
          scaledNow(presentation === "spectator" ? 1700 : 1350),
        );
        [shipA, shipB].forEach((ship) => {
          if (!resolution.destroyedIds.includes(ship.id) || visuallyDestroyedIds.has(ship.id)) return;
          visuallyDestroyedIds.add(ship.id);
          destroyShipVisual(context, ship, scaledNow(1750));
        });
        await delay(presentation === "spectator" ? 980 : 720);
        focusRef.current(null);
        await delay(presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.betweenShots : 120);
      }
    };

    const playSalvos = async () => {
      const shots = resolution.shots
        .filter((shot) => shot.valid)
        .map((shot) => ({
          shot,
          shooter: resolution.endShips.find((ship) => ship.id === shot.shooterId),
          target: resolution.endShips.find((ship) => ship.id === shot.targetId),
        }))
        .filter((entry): entry is { shot: CombatShotEvent; shooter: Ship; target: Ship } => Boolean(entry.shooter && entry.target));

      if (!shots.length) {
        await delay(presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.quietTurnHold : 420);
        await finishCinematic();
        return;
      }

      context.camera.fov = 42;
      context.camera.updateProjectionMatrix();
      const visibility = ensureCombatVisibility();

      for (const { shot, shooter, target } of shots) {
        if (cancelled) return;
        if (visuallyDestroyedIds.has(target.id)) continue;
        isolateCombatParticipants(context, visibility, shooter.id, target.id);
        const muzzle = weaponOriginFor(shooter, shot.weapon);
        const targetPoint = new THREE.Vector3(...target.position);
        const direction = targetPoint.clone().sub(muzzle).normalize();
        const upReference = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0))) > 0.92
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(direction, upReference).normalize();
        const lift = new THREE.Vector3().crossVectors(side, direction).normalize();
        const cameraPosition = muzzle
          .clone()
          .addScaledVector(direction, -4.8)
          .addScaledVector(side, shooter.team === "enemy" ? -2.3 : 2.3)
          .addScaledVector(lift, 1.65);
        const lookAt = muzzle.clone().lerp(targetPoint, 0.48);

        const focusSuffix = resolution.orders[shot.shooterId]?.mode === "focus-fire"
          ? ` · SALVO ${shot.salvoIndex + 1}/2`
          : "";
        focusRef.current({
          kind: "weapon",
          left: cinematicSummaryFor(shooter),
          right: cinematicSummaryFor(target),
          detail: `${shot.weapon.name}${focusSuffix}`,
        });
        await tweenCamera(
          cameraPosition,
          lookAt,
          presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.cameraApproach : 430,
        );
        if (cancelled) return;
        clearGroup(context.laserGroup);
        const beam = addCinematicBeam(context.laserGroup, shooter, target, shot);
        await growBeam(beam, presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.beam : 240);
        const shieldDamage = Math.max(0, shot.shieldBefore - shot.shieldAfter);
        const hullDamage = Math.max(0, shot.hullBefore - shot.hullAfter);
        spawnDamageNumber(
          context,
          targetPoint,
          shieldDamage,
          "shield",
          "SHIELD",
          hullDamage > 0 ? -0.55 : 0,
          scaledNow(presentation === "spectator" ? 1650 : 1300),
        );
        spawnDamageNumber(
          context,
          targetPoint,
          hullDamage,
          "hull",
          "HULL",
          shieldDamage > 0 ? 0.55 : 0,
          scaledNow(presentation === "spectator" ? 1650 : 1300),
        );
        const hud = context.shipHuds.get(target.id);
        if (hud) updateShipHud(hud, { ...target, hull: shot.hullAfter }, overlayLabelsRef.current);
        if (shot.face) {
          const group = context.shipGroups.get(target.id);
          const materials = group?.userData.shieldMaterials as Partial<Record<ShieldFace, THREE.MeshStandardMaterial>> | undefined;
          const material = materials?.[shot.face];
          if (material) {
            material.color.copy(shieldColor(shot.shieldAfter, target.maxShields[shot.face]));
            material.emissive.copy(shieldColor(shot.shieldAfter, target.maxShields[shot.face]).multiplyScalar(0.75));
          }
        }
        if (shot.destroyed) {
          visuallyDestroyedIds.add(target.id);
          destroyShipVisual(context, target, scaledNow(1750));
        }
        await delay(
          presentation === "spectator"
            ? shot.destroyed
              ? FISHTANK_CINEMATIC_TIMINGS.destroyedHold
              : FISHTANK_CINEMATIC_TIMINGS.impactHold
            : shot.destroyed
              ? 760
              : 540,
        );
        clearGroup(context.laserGroup);
        await delay(presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.betweenShots : 120);
      }

      await finishCinematic();
    };

    const playResolutionCinematics = async () => {
      await playCollisions();
      if (!cancelled) await playSalvos();
    };

    context.controls.enabled = false;

    const animateMovement = (raw: number) => {
      const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      resolution.endShips.forEach((endShip) => {
        const group = context.shipGroups.get(endShip.id);
        const start = starts.get(endShip.id);
        if (!group || !start) return;
        group.position.lerpVectors(start.position, new THREE.Vector3(...endShip.position), eased);
        group.quaternion.slerpQuaternions(start.quaternion, quaternionFor(endShip.rotation), eased);
      });
    };
    void runTimedAnimation(
      presentation === "spectator" ? FISHTANK_CINEMATIC_TIMINGS.movement : 1550,
      animateMovement,
    ).then(() => {
      if (!cancelled) void playResolutionCinematics();
    });

    return () => {
      cancelled = true;
      focusRef.current(null);
      clearGroup(context.laserGroup);
      if (combatVisibility) restoreCombatVisibility(context, combatVisibility, resolution.destroyedIds);
      context.controls.enabled = true;
      context.camera.position.copy(tacticalPosition);
      context.controls.target.copy(tacticalTarget);
      context.camera.fov = tacticalFov;
      context.camera.updateProjectionMatrix();
      context.controls.update();
    };
  }, [presentation, resolution, ships, showFleetStations]);

  return <div className="three-mount" ref={mountRef} />;
}

function FishtankFleetBars({ ships, highlightedIds }: { ships: Ship[]; highlightedIds: ReadonlySet<string> }) {
  const rows = createFishtankStatusRows(ships);
  return (
    <ol className="fishtank-fleet-bars">
      {rows.map(({ ship, healthPercentage, fighters }) => {
        const sizeCode = ship.sizeClass === "shuttle" ? "S" : ship.sizeClass === "cruiser" ? "M" : "L";
        const reserveCapacity = ship.turnEndAbility?.fighterReserve ?? 0;
        const reserveRemaining = ship.hull > 0
          ? Math.max(0, Math.min(reserveCapacity, ship.fighterReserveRemaining ?? reserveCapacity))
          : 0;
        return (
          <li className="fishtank-formation-slot" key={ship.id}>
            {fighters.length > 0 && (
              <span className="fishtank-carrier-wing" aria-label={`${fighters.length} active fighters launched by ${ship.name}`}>
                {fighters.map(({ fighter, healthPercentage: fighterHealth }) => (
                  <span
                    className={`fishtank-ship-bar carrier-fighter ${highlightedIds.has(fighter.id) ? "cinematic-active" : ""}`}
                    data-size="shuttle"
                    key={fighter.id}
                    role="img"
                    aria-label={`${fighter.name}, small fighter, ${Math.round(fighterHealth)} percent hull`}
                  >
                    <i style={{ width: `${fighterHealth}%` }} />
                  </span>
                ))}
              </span>
            )}
            <span
              className={`fishtank-ship-bar ${ship.hull <= 0 ? "destroyed" : ""} ${highlightedIds.has(ship.id) ? "cinematic-active" : ""}`}
              data-size={ship.sizeClass}
              role="img"
              aria-label={`${ship.name}, size ${sizeCode}, ${Math.round(healthPercentage)} percent hull${ship.hull <= 0 ? ", destroyed" : ""}`}
            >
              <i style={{ width: `${healthPercentage}%` }} />
            </span>
            {reserveCapacity > 0 && (
              <span
                className="fishtank-carrier-reserve"
                role="img"
                aria-label={`${ship.name}, ${reserveRemaining} of ${reserveCapacity} reserve fighters available`}
              >
                {Array.from({ length: reserveCapacity }, (_, index) => (
                  <i className={index < reserveRemaining ? "available" : "spent"} key={index} />
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
  step = 1,
  decimals = 0,
  axis,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  disabled: boolean;
  step?: number;
  decimals?: number;
  axis?: string;
  lowLabel?: string;
  highLabel?: string;
}) {
  const formattedValue = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return (
    <label className="slider-control">
      <span>
        <span className="slider-name">{axis && <b>{axis}</b>}{label}</span>
        <output>{value > 0 && min < 0 ? "+" : ""}{formattedValue}{suffix}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {lowLabel && highLabel && <small className="slider-directions"><span>{lowLabel}</span><span>{highLabel}</span></small>}
    </label>
  );
}

function AudioChannelControl({
  label,
  description,
  enabled,
  volume,
  onToggle,
  onVolumeChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <div className={`audio-channel ${enabled ? "enabled" : "muted"}`}>
      <div className="audio-channel-heading">
        <div><strong>{label}</strong><span>{description}</span></div>
        <button type="button" aria-pressed={enabled} aria-label={`${enabled ? "Mute" : "Enable"} ${label}`} onClick={onToggle}>
          <i /><span>{enabled ? "ON" : "OFF"}</span>
        </button>
      </div>
      <label>
        <span>VOLUME</span>
        <input type="range" min={0} max={100} step={1} value={volume} disabled={!enabled} aria-label={`${label} volume`} onChange={(event) => onVolumeChange(Number(event.target.value))} />
        <output>{volume}%</output>
      </label>
    </div>
  );
}

function MainMenu({
  selectedMode,
  audioSettings,
  modelVariant,
  onSelectMode,
  onLaunch,
  onAudioChange,
  onModelVariantChange,
}: {
  selectedMode: GameMode;
  audioSettings: AudioSettings;
  modelVariant: ShipModelVariant;
  onSelectMode: (mode: GameMode) => void;
  onLaunch: (mode: GameMode) => void;
  onAudioChange: (patch: Partial<AudioSettings>) => void;
  onModelVariantChange: (variant: ShipModelVariant) => void;
}) {
  const selected = MODE_OPTIONS.find((mode) => mode.id === selectedMode) ?? MODE_OPTIONS[1];

  return (
    <main className="main-menu">
      <div className="menu-space" aria-hidden="true">
        <span className="menu-orbit orbit-one" />
        <span className="menu-orbit orbit-two" />
        <span className="menu-orbit orbit-three" />
        <span className="menu-planet" />
        <i className="menu-contact contact-one" />
        <i className="menu-contact contact-two" />
        <i className="menu-contact contact-three" />
      </div>

      <header className="menu-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <div><strong>PARALLAX</strong><span>Fleet tactics command</span></div>
        </div>
        <div className="menu-system-status"><i /><span>COMMAND LINK ONLINE</span><strong>BUILD 0.6.0</strong></div>
      </header>

      <div className="menu-content">
        <section className="menu-intro" aria-labelledby="menu-title">
          <span className="eyebrow">COMMAND TERMINAL · KESTREL THEATRE</span>
          <h1 id="menu-title">SELECT<br /><em>OPERATION</em></h1>
          <p>Choose the rules of engagement, take command of your fleet, and commit every vector before the enemy does.</p>
          <div className="prototype-notice">
            <i />
            <span><strong>STORY CAMPAIGN ONLINE</strong><small>Escape hostile territory through 10 warp gates. Further rulesets remain in development.</small></span>
          </div>
        </section>

        <section className="mode-picker" aria-labelledby="mode-picker-title">
          <div className="menu-section-heading">
            <div><span>01</span><strong id="mode-picker-title">GAME MODE</strong></div>
            <small>SELECT ONE</small>
          </div>
          <div className="mode-grid">
            {MODE_OPTIONS.map((mode) => (
              <button
                type="button"
                key={mode.id}
                className={`mode-card ${selectedMode === mode.id ? "selected" : ""} ${mode.id === "hardcore" ? "hardcore" : ""}`}
                aria-pressed={selectedMode === mode.id}
                data-game-mode={mode.id}
                data-mode-status={mode.id === "story" || mode.id === "fishtank" ? "ready" : "framework"}
                data-story-gates={mode.id === "story" ? STORY_GATE_COUNT : undefined}
                onClick={() => onSelectMode(mode.id)}
              >
                <span className="mode-number">{mode.number}</span>
                <span className="mode-copy">
                  <small>{mode.category}</small>
                  <strong>{mode.label}</strong>
                  <p>{mode.description}</p>
                </span>
                <span className="mode-status"><i />{mode.status}</span>
              </button>
            ))}
          </div>
          <button type="button" className="launch-mode-button" onClick={() => onLaunch(selectedMode)}>
            <span><small>SELECTED · {selected.category.toUpperCase()}</small><strong>INITIALIZE {selected.label.toUpperCase()}</strong></span>
            <b aria-hidden="true">→</b>
          </button>
          <p className="mode-footnote">Story Mode runs the complete escape campaign. Fishtank Mode runs unattended AI-versus-AI fleet simulations.</p>
        </section>

        <aside className="audio-panel" aria-labelledby="audio-title">
          <div className="menu-section-heading">
            <div><span>02</span><strong id="audio-title">AUDIO</strong></div>
            <small>PREFERENCES</small>
          </div>
          <AudioChannelControl
            label="Sound effects"
            description="Weapons · engines · interface"
            enabled={audioSettings.soundEnabled}
            volume={audioSettings.soundVolume}
            onToggle={() => onAudioChange({ soundEnabled: !audioSettings.soundEnabled })}
            onVolumeChange={(soundVolume) => onAudioChange({ soundVolume })}
          />
          <AudioChannelControl
            label="Music"
            description="Score · ambience"
            enabled={audioSettings.musicEnabled}
            volume={audioSettings.musicVolume}
            onToggle={() => onAudioChange({ musicEnabled: !audioSettings.musicEnabled })}
            onVolumeChange={(musicVolume) => onAudioChange({ musicVolume })}
          />
          <div className="audio-placeholder"><i /><span>AUDIO BUS READY</span><small>Sound assets connect in a future pass.</small></div>
          <section className="model-variant-panel" aria-labelledby="model-variant-title">
            <div className="menu-section-heading">
              <div><span>03</span><strong id="model-variant-title">SHIP MODELS</strong></div>
              <small>DEVICE PREFERENCE</small>
            </div>
            <fieldset className="model-variant-options">
              <legend>Choose ship model detail</legend>
              {SHIP_MODEL_VARIANTS.map((variant) => {
                const option = MODEL_VARIANT_OPTIONS[variant];
                return (
                  <label key={variant} className={modelVariant === variant ? "selected" : ""}>
                    <input
                      type="radio"
                      name="ship-model-variant"
                      value={variant}
                      checked={modelVariant === variant}
                      aria-label={option.label}
                      onChange={() => onModelVariantChange(variant)}
                    />
                    <span><strong>{option.shortLabel}</strong><small>{option.description}</small></span>
                    <i aria-hidden="true" />
                  </label>
                );
              })}
            </fieldset>
          </section>
        </aside>
      </div>

      <footer className="menu-footer">
        <span>PARALLAX COMMAND OS</span>
        <span>SIMULTANEOUS MOVEMENT · ORDERED FIRE</span>
        <span>LOCAL AUDIO PROFILE ACTIVE</span>
      </footer>
    </main>
  );
}

function StoryCampaignScreen({
  run,
  ships,
  onBeginGate,
  onChooseSalvage,
  onChooseEncounter,
  onContinue,
  onRestart,
  onMenu,
}: {
  run: StoryRun;
  ships: Ship[];
  onBeginGate: () => void;
  onChooseSalvage: (option: SalvageOption) => void;
  onChooseEncounter: (choiceIndex: number) => void;
  onContinue: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  const config = STORY_GATE_CONFIGS[Math.min(run.gate - 1, STORY_GATE_CONFIGS.length - 1)];
  const playerShips = ships.filter((ship) => ship.team === "player");
  const livingShips = playerShips.filter((ship) => ship.hull > 0);
  const flagship = livingShips[0] ?? playerShips[0];
  const shieldAverage = flagship
    ? Math.round(SHIELD_FACES.reduce((sum, face) => sum + flagship.shields[face], 0) / SHIELD_FACES.length)
    : 0;
  const shieldCapacityAverage = flagship
    ? Math.round(SHIELD_FACES.reduce((sum, face) => sum + flagship.maxShields[face], 0) / SHIELD_FACES.length)
    : 0;
  const encounter = run.currentEncounter;
  const outcome = run.outcome;
  const isFinished = run.stage === "won" || run.stage === "lost";
  const commandTransferred = Boolean(flagship && flagship.id !== "hammerhead");

  useEffect(() => {
    stageHeadingRef.current?.focus();
  }, [run.stage]);

  return (
    <main className="story-shell" data-story-phase={run.stage} data-gate={run.gate} data-total-gates={STORY_GATE_COUNT}>
      <div className="story-space" aria-hidden="true"><i /><i /><i /><span /></div>
      <header className="story-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <div><strong>PARALLAX</strong><span>Story campaign · Flight record HM-01</span></div>
        </div>
        <div className="story-header-progress" aria-label={`Warp gate ${run.gate} of ${STORY_GATE_COUNT}`}>
          <span>ESCAPE VECTOR</span>
          <strong>{String(run.clearedGates).padStart(2, "0")} / {STORY_GATE_COUNT} GATES CLEARED</strong>
        </div>
        <button type="button" className="quiet-button" onClick={onMenu}>Main menu</button>
      </header>

      <div className="story-layout">
        <aside className="story-route-panel">
          <span className="eyebrow">ROUTE · HOSTILE TERRITORY</span>
          <h2>Ten folds<br /><em>to freedom</em></h2>
          <p>Every gate closes behind you. Damage, recruits, and stolen improvements carry forward. If the Hammerhead falls, its flight core and command transfer to a surviving squadmate.</p>
          <ol className="story-gate-route" aria-label="Campaign gate progress">
            {STORY_GATE_CONFIGS.map((gate, index) => {
              const number = index + 1;
              const state = number <= run.clearedGates ? "cleared" : number === run.gate && !isFinished ? "active" : "locked";
              return (
                <li className={state} key={gate.name} aria-current={state === "active" ? "step" : undefined}>
                  <i>{number <= run.clearedGates ? "✓" : String(number).padStart(2, "0")}</i>
                  <span><strong>{gate.name}</strong><small>{gate.region}</small></span>
                  <b>{state === "cleared" ? "CLEAR" : state === "active" ? "NEXT" : "LOCK"}</b>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="story-stage-panel" aria-live="polite">
          {run.stage === "briefing" && (
            <div className="story-briefing story-stage-content">
              <span className="story-signal"><i /> BLACKSITE ALARM · PURSUIT ACTIVE</span>
              <small className="story-step">CAMPAIGN BRIEF · GATE 01 / {STORY_GATE_COUNT}</small>
              <h1 ref={stageHeadingRef} tabIndex={-1}>You stole the Hammerhead.<br /><em>Now outrun their fleet.</em></h1>
              <p>HM-01—the Hammerhead—was waiting in a hostile impound ring with its registry unlocked. The nearest safe system lies ten warp gates away—and every gate is already being sealed.</p>
              <div className="story-rules">
                <div><b>01</b><span><strong>Break each blockade</strong><small>Enemy formations grow stronger along the route.</small></span></div>
                <div><b>02</b><span><strong>Salvage the wrecks</strong><small>Choose one repair or permanent ship upgrade.</small></span></div>
                <div><b>03</b><span><strong>Answer the signal</strong><small>Commit to one response after every cleared gate.</small></span></div>
              </div>
              <button type="button" className="story-primary-action" onClick={onBeginGate}><span><small>FIRST CONTACT · {config.threat.toUpperCase()}</small><strong>ENTER WARP GATE 01</strong></span><b>→</b></button>
            </div>
          )}

          {run.stage === "salvage" && (
            <div className="story-salvage story-stage-content">
              <span className="story-signal clear"><i /> GATE {String(run.gate).padStart(2, "0")} BLOCKADE BROKEN</span>
              <small className="story-step">SALVAGE PHASE · CHOOSE ONE</small>
              <h1 ref={stageHeadingRef} tabIndex={-1}>Take what<br /><em>still works.</em></h1>
              <p>The destroyed formation is falling into the gate wake. There is time to recover one system before the wreckage disappears.</p>
              <div className="salvage-grid">
                {run.salvageOptions.map((option, index) => (
                  <button type="button" key={option.id} className={option.rarity === "elite" ? "elite" : ""} onClick={() => onChooseSalvage(option)}>
                    <span className="salvage-index">0{index + 1}</span>
                    <small>{option.rarity === "elite" ? `◆ ELITE · ${option.category}` : option.category}</small>
                    <strong>{option.label}</strong>
                    <p>{option.description}</p>
                    <b>{option.effectLabel}</b>
                    <i aria-hidden="true">→</i>
                  </button>
                ))}
              </div>
              <p className="story-random-note"><i /> Salvage choices are drawn once from the wreck field and cannot be rerolled.</p>
            </div>
          )}

          {run.stage === "encounter" && encounter && (
            <div className="story-encounter story-stage-content" data-encounter-id={encounter.id}>
              <span className="story-signal warning"><i /> {encounter.signal}</span>
              <small className="story-step">GATE WAKE ENCOUNTER · DECISION REQUIRED</small>
              <h1 ref={stageHeadingRef} tabIndex={-1}>{encounter.title}</h1>
              <p>{encounter.description}</p>
              <div className="story-choice-grid">
                {encounter.choices.map((choice, index) => (
                  <button type="button" key={choice.id} onClick={() => onChooseEncounter(index)} aria-labelledby={`choice-${encounter.id}-${choice.id}-label`} aria-describedby={`choice-${encounter.id}-${choice.id}-description`}>
                    <span aria-hidden="true">OPTION 0{index + 1}</span>
                    <strong id={`choice-${encounter.id}-${choice.id}-label`}>{choice.label}</strong>
                    <p id={`choice-${encounter.id}-${choice.id}-description`}>{choice.description}</p>
                    <b aria-hidden="true">COMMIT →</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          {run.stage === "outcome" && outcome && (
            <div className={`story-outcome story-stage-content ${outcome.tone}`} role="status">
              <span className={`story-signal ${outcome.tone === "favourable" ? "clear" : "warning"}`}><i /> DECISION RESOLVED · {run.selectedChoiceLabel.toUpperCase()}</span>
              <small className="story-step">OUTCOME · {outcome.tone.toUpperCase()}</small>
              <div className="outcome-glyph" aria-hidden="true"><i /><b /></div>
              <h1 ref={stageHeadingRef} tabIndex={-1}>{outcome.title}</h1>
              <p>{outcome.description}</p>
              <div className="outcome-effect"><span>RUN EFFECT</span><strong>{outcome.effectLabel}</strong></div>
              <button type="button" className="story-primary-action" onClick={onContinue}><span><small>NEXT · {STORY_GATE_CONFIGS[run.gate]?.threat.toUpperCase()}</small><strong>ENTER WARP GATE {String(run.gate + 1).padStart(2, "0")}</strong></span><b>→</b></button>
            </div>
          )}

          {run.stage === "won" && (
            <div className="story-finale story-stage-content won" role="status">
              <span className="story-signal clear"><i /> TERRITORIAL BOUNDARY CROSSED</span>
              <small className="story-step">CAMPAIGN COMPLETE · {STORY_GATE_COUNT} / {STORY_GATE_COUNT}</small>
              <div className="finale-mark" aria-hidden="true"><i /><i /><b /></div>
              <h1 ref={stageHeadingRef} tabIndex={-1}>Out of their reach.</h1>
              <p>The last blockade collapses behind the surviving squadron. HM-01&apos;s flight record reaches open space—aboard the Hammerhead or the command ship that carried its core onward.</p>
              <div className="finale-stats"><span><small>GATES CLEARED</small><strong>{STORY_GATE_COUNT}</strong></span><span><small>SHIPS ESCAPED</small><strong>{livingShips.length}</strong></span><span><small>DECISIONS SURVIVED</small><strong>{run.seenEncounterIds.length}</strong></span></div>
              <div className="story-final-actions"><button type="button" className="story-primary-action" onClick={onRestart}><span><small>NEW RANDOM ROUTE</small><strong>START ANOTHER ESCAPE</strong></span><b>↻</b></button><button type="button" className="story-secondary-action" onClick={onMenu}>Return to main menu</button></div>
            </div>
          )}

          {run.stage === "lost" && (
            <div className="story-finale story-stage-content lost" role="status">
              <span className="story-signal danger"><i /> ESCAPE VECTOR TERMINATED</span>
              <small className="story-step">CAMPAIGN LOST · GATE {String(run.gate).padStart(2, "0")}</small>
              <div className="finale-mark" aria-hidden="true"><i /><i /><b /></div>
              <h1 ref={stageHeadingRef} tabIndex={-1}>The dark closes in.</h1>
              <p>{outcome?.description ?? "The Hammerhead can no longer hold pressure. Hostile retrieval signals converge on the last known vector."}</p>
              {outcome && <div className="outcome-effect"><span>FINAL EFFECT</span><strong>{outcome.effectLabel}</strong></div>}
              <div className="story-final-actions"><button type="button" className="story-primary-action" onClick={onRestart}><span><small>RESET ALL UPGRADES</small><strong>START A NEW ESCAPE</strong></span><b>↻</b></button><button type="button" className="story-secondary-action" onClick={onMenu}>Return to main menu</button></div>
            </div>
          )}
        </section>

        <aside className="story-manifest-panel">
          <div className="manifest-heading"><span>{commandTransferred ? "COMMAND TRANSFER" : "STOLEN ASSET"}</span><strong>{flagship?.callsign ?? "SIGNAL LOST"}</strong></div>
          <div className="manifest-ship">
            <span className="manifest-ship-mark" aria-hidden="true"><i /><i /><b /></span>
            <div><small>COMMAND SHIP</small><strong>{flagship?.name ?? "HM-01 LOST"}</strong><span>{flagship ? `${flagship.className} · ${SHIP_SIZE_PROFILES[flagship.sizeClass].label} class` : "No surviving hull"}</span></div>
          </div>
          <div className="manifest-stats">
            <div><span>HULL</span><strong>{Math.round(flagship?.hull ?? 0)}<small> / {flagship?.maxHull ?? 0}</small></strong></div>
            <div><span>SHIELD AVG</span><strong>{shieldAverage}<small> / {shieldCapacityAverage}</small></strong></div>
            <div><span>GUN POWER</span><strong>{flagship ? weaponProfilesFor(flagship).reduce((sum, weapon) => sum + weapon.damage, 0) : 0}<small> VOLLEY</small></strong></div>
            <div><span>GUN RANGE</span><strong>{flagship ? Math.max(...weaponProfilesFor(flagship).map((weapon) => weapon.range)) : 0}<small> KM</small></strong></div>
            <div><span>MOVE RANGE</span><strong>{flagship?.maxMove ?? 0}<small> KM</small></strong></div>
            <div><span>GUN MOUNTS</span><strong>{flagship ? weaponProfilesFor(flagship).length : 0}<small> ACTIVE</small></strong></div>
          </div>
          <div className="manifest-squad">
            <span>SURVIVING SHIPS</span>
            {playerShips.map((ship, index) => <div key={ship.id} className={ship.hull <= 0 ? "lost" : ""}><i>{String(index + 1).padStart(2, "0")}</i><p><strong>{ship.name}</strong><small>{ship.hull <= 0 ? "LOST" : `${SHIP_SIZE_PROFILES[ship.sizeClass].label.toUpperCase()} · ${ship.controller === "ai" ? `AI ${AI_DOCTRINE_RULES[ship.aiDoctrine ?? "standard"].label.toUpperCase()} · ` : ""}${Math.round((ship.hull / ship.maxHull) * 100)}% HULL`}</small></p></div>)}
          </div>
          <div className={`manifest-pursuit ${run.pendingThreats.length ? "hot" : "clear"}`}><i /><span><small>SIGNALS IN YOUR WAKE</small><strong>{run.pendingThreats.length ? `${run.pendingThreats.length} UNRESOLVED` : "NO LOCK"}</strong></span></div>
          <div className="manifest-log"><span>FLIGHT RECORD</span><ol>{run.history.slice(0, 4).map((entry, index) => <li key={`${entry}-${index}`}><i />{entry}</li>)}</ol></div>
        </aside>
      </div>
      <footer className="story-footer"><span>RUN STATE · SESSION LOCAL</span><span>{config.region.toUpperCase()} · {config.threat.toUpperCase()}</span><span>FLIGHT RECORD · ENCRYPTED</span></footer>
    </main>
  );
}

export function SpaceGame() {
  const [screen, setScreen] = useState<GameScreen>("menu");
  const [selectedMode, setSelectedMode] = useState<GameMode>("skirmish");
  const [activeMode, setActiveMode] = useState<GameMode>("skirmish");
  const [storyRun, setStoryRun] = useState<StoryRun | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [modelVariant, setModelVariant] = useState<ShipModelVariant>("classic");
  const [overlayLabels, setOverlayLabels] = useState<OverlayLabelSettings>(DEFAULT_OVERLAY_LABELS);
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>(DEFAULT_ANIMATION_SPEED);
  const [audioSettingsHydrated, setAudioSettingsHydrated] = useState(false);
  const [modelVariantHydrated, setModelVariantHydrated] = useState(false);
  const [ships, setShips] = useState<Ship[]>(() => copyShips(INITIAL_SHIPS));
  const [selectedShipId, setSelectedShipId] = useState("aegis");
  const [drafts, setDrafts] = useState<Record<string, Order>>(() => buildDrafts(INITIAL_SHIPS));
  const [staged, setStaged] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>("planning");
  const [turn, setTurn] = useState(1);
  const [log, setLog] = useState(INITIAL_LOG);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [combatFocus, setCombatFocus] = useState<CombatFocus | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ kind: "reset", nonce: 0 });
  const [helpOpen, setHelpOpen] = useState(true);
  const [fishtankMatch, setFishtankMatch] = useState(0);
  const storyActionLockRef = useRef(false);
  const fishtankMatchRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let nextSettings = DEFAULT_AUDIO_SETTINGS;
    try {
      const saved = window.localStorage.getItem("parallax.audio.v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AudioSettings>;
        nextSettings = {
          soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_AUDIO_SETTINGS.soundEnabled,
          soundVolume: typeof parsed.soundVolume === "number" ? clamp(parsed.soundVolume, 0, 100) : DEFAULT_AUDIO_SETTINGS.soundVolume,
          musicEnabled: typeof parsed.musicEnabled === "boolean" ? parsed.musicEnabled : DEFAULT_AUDIO_SETTINGS.musicEnabled,
          musicVolume: typeof parsed.musicVolume === "number" ? clamp(parsed.musicVolume, 0, 100) : DEFAULT_AUDIO_SETTINGS.musicVolume,
        };
      }
    } catch {
      // Device-local settings are optional; defaults remain available.
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setAudioSettings(nextSettings);
      setAudioSettingsHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!audioSettingsHydrated) return;
    try {
      window.localStorage.setItem("parallax.audio.v1", JSON.stringify(audioSettings));
    } catch {
      // Browsers may disable local storage; settings still work for this session.
    }
  }, [audioSettings, audioSettingsHydrated]);

  useEffect(() => {
    let cancelled = false;
    let savedVariant: ShipModelVariant = "classic";
    try {
      const saved = window.localStorage.getItem("parallax.models.v1");
      if (saved === "classic" || saved === "detailed" || saved === "super") savedVariant = saved;
    } catch {
      // Device-local settings are optional; the classic hulls remain available.
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setModelVariant(savedVariant);
      setModelVariantHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!modelVariantHydrated) return;
    try {
      window.localStorage.setItem("parallax.models.v1", modelVariant);
    } catch {
      // Browsers may disable local storage; the choice still works for this session.
    }
  }, [modelVariant, modelVariantHydrated]);

  useEffect(() => {
    storyActionLockRef.current = false;
  }, [storyRun?.stage]);

  const battlefieldBounds = battlefieldForMode(activeMode);
  const showFleetStations = activeMode !== "story";
  const selectedShip = ships.find((ship) => ship.id === selectedShipId)
    ?? ships.find((ship) => ship.controller === "player" && ship.hull > 0)
    ?? ships.find((ship) => ship.team === "player" && ship.hull > 0)
    ?? ships[0];
  const selectedDraft = selectedShip ? drafts[selectedShip.id] : undefined;
  const enemies = ships.filter((ship) => ship.team === "enemy" && ship.hull > 0);
  const playerShips = ships.filter((ship) => ship.team === "player");
  const commandShips = ships.filter(isDirectCommandShip);
  const livingCommandShips = commandShips.filter((ship) => ship.hull > 0);
  const alliedNPCs = ships.filter((ship) => ship.controller === "ai" && ship.team !== "enemy" && ship.hull > 0);
  const selectedTargetId = selectedDraft?.targetId ?? "";
  const selectedTarget = ships.find((ship) => ship.id === selectedTargetId && ship.team === "enemy" && ship.hull > 0);
  const cinematicShipIds = new Set(combatFocus ? [combatFocus.left.id, combatFocus.right.id] : []);
  const readyCount = livingCommandShips.filter((ship) => staged.has(ship.id)).length;
  const isCommandOrderValid = (ship: Ship) => {
    const bounds = battlefieldForMode(activeMode);
    const order = drafts[ship.id];
    if (!order || !isDestinationValid(ship, order.destination, order.mode, bounds)) return false;
    return order.mode !== "focus-fire" || ships.some((candidate) => candidate.id === order.targetId && candidate.team === "enemy" && candidate.hull > 0);
  };
  const allOrdersValid = livingCommandShips.every(isCommandOrderValid);
  const allReady = isFleetCommitReady(ships, staged, isCommandOrderValid);
  const plottedDistance = selectedShip && selectedDraft ? distanceBetween(selectedShip.position, selectedDraft.destination) : 0;
  const movementLimit = selectedShip && selectedDraft ? movementLimitFor(selectedShip.maxMove, selectedDraft.mode) : 0;
  const destinationValid = selectedShip && selectedDraft
    ? isDestinationValid(selectedShip, selectedDraft.destination, selectedDraft.mode, battlefieldBounds)
    : false;
  const orderReady = Boolean(destinationValid && selectedDraft && (selectedDraft.mode !== "focus-fire" || selectedTarget));
  const relativeMovement = selectedShip && selectedDraft
    ? shipMovementFromDestination(selectedShip.position, selectedShip.rotation, selectedDraft.destination)
    : { forward: 0, right: 0, up: 0 };

  const updateAudioSettings = useCallback((patch: Partial<AudioSettings>) => {
    setAudioSettings((current) => ({ ...current, ...patch }));
  }, []);

  const forecast = useMemo(() => {
    if (!selectedShip || !selectedDraft) return null;
    const bounds = battlefieldForMode(activeMode);
    const target = ships.find((ship) => ship.id === selectedDraft.targetId && ship.hull > 0);
    const salvoCount = salvosForOrder(selectedDraft);
    if (!target || salvoCount === 0) return null;
    const predicted = endStateFor(selectedShip, selectedDraft, bounds);
    const solutions = weaponProfilesFor(predicted).map((weapon) => ({
      weapon,
      solution: shotSolutionForWeapon(predicted, target, weapon),
    }));
    const validSolutions = solutions.filter(({ solution }) => solution.valid);
    return {
      solutions,
      valid: validSolutions.length > 0,
      validCount: validSolutions.length * salvoCount,
      total: solutions.length * salvoCount,
      inRange: solutions.some(({ solution }) => solution.inRange),
      distance: Math.min(...solutions.map(({ solution }) => solution.distance)),
      damage: validSolutions.reduce((sum, { weapon }) => sum + weapon.damage, 0) * salvoCount,
      salvoCount,
    };
  }, [selectedShip, selectedDraft, ships, activeMode]);

  const updateDraft = useCallback((patch: Partial<Order>) => {
    if (!selectedShip || selectedShip.controller !== "player" || phase !== "planning") return;
    setDrafts((current) => ({
      ...current,
      [selectedShip.id]: { ...current[selectedShip.id], ...patch },
    }));
    setStaged((current) => {
      const next = new Set(current);
      next.delete(selectedShip.id);
      return next;
    });
  }, [selectedShip, phase]);

  const updateAiDoctrine = useCallback((doctrine: AiDoctrine) => {
    if (!selectedShip || selectedShip.controller !== "ai" || selectedShip.team === "enemy" || selectedShip.spawnedByShipId || phase !== "planning") return;
    setShips((current) => current.map((ship) => ship.id === selectedShip.id ? { ...ship, aiDoctrine: doctrine } : ship));
  }, [selectedShip, phase]);

  const updateRelativeMovement = useCallback((axis: keyof ShipRelativeMovement, value: number) => {
    if (!selectedShip || !selectedDraft) return;
    const bounds = battlefieldForMode(activeMode);
    const movement = shipMovementFromDestination(selectedShip.position, selectedShip.rotation, selectedDraft.destination);
    const constrainedMovement = clampShipMovementToRange(
      { ...movement, [axis]: value },
      movementLimitFor(selectedShip.maxMove, selectedDraft.mode),
    );
    const proposedDestination = destinationFromShipMovement(
      selectedShip.position,
      selectedShip.rotation,
      constrainedMovement,
    );
    updateDraft({
      destination: clampDestination(selectedShip, proposedDestination, selectedDraft.mode, bounds),
    });
  }, [selectedShip, selectedDraft, updateDraft, activeMode]);

  const updateFlightMode = useCallback((mode: FlightMode) => {
    if (!selectedShip || !selectedDraft) return;
    const bounds = battlefieldForMode(activeMode);
    updateDraft({
      mode,
      destination: mode === "focus-fire"
        ? [...selectedShip.position] as Vec3
        : clampDestination(selectedShip, selectedDraft.destination, mode, bounds),
      fire: fireStateForMode(mode, true),
    });
  }, [selectedShip, selectedDraft, updateDraft, activeMode]);

  const faceTarget = useCallback(() => {
    if (!selectedShip || !selectedDraft) return;
    const target = ships.find((ship) => ship.id === selectedDraft.targetId);
    if (!target) return;
    const delta = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...selectedDraft.destination));
    const flat = Math.hypot(delta.x, delta.z);
    const desiredTurn = THREE.MathUtils.radToDeg(Math.atan2(delta.x, -delta.z));
    const desiredPitch = THREE.MathUtils.radToDeg(Math.atan2(delta.y, flat));
    updateDraft({
      turn: clamp(normalizeAngle(desiredTurn - selectedShip.rotation[1]), -selectedShip.maxTurn, selectedShip.maxTurn),
      pitch: clamp(desiredPitch - selectedShip.rotation[0], -selectedShip.maxPitch, selectedShip.maxPitch),
    });
  }, [selectedShip, selectedDraft, ships, updateDraft]);

  const generateNpcOrders = useCallback((currentShips: Ship[]) => {
    const bounds = battlefieldForMode(activeMode);
    const orders: Record<string, Order> = {};
    const wingTargets = carrierWingTargetAssignments(currentShips);
    currentShips
      .filter((ship) => ship.controller === "ai" && ship.hull > 0)
      .forEach((ship) => {
        const reservedDestinations = Object.fromEntries(
          Object.entries(orders).map(([id, order]) => [id, order.destination]),
        );
        const order = generateAiCommandOrder(
          ship,
          currentShips,
          ship.aiDoctrine ?? "standard",
          bounds.halfLength,
          bounds.halfHeight,
          {
            forcedTargetId: wingTargets[ship.id],
            reservedDestinations,
            battlefieldWidthHalf: bounds.halfWidth,
          },
        );
        if (order) orders[ship.id] = order;
      });
    return orders;
  }, [activeMode]);

  const executeTurn = useCallback((automatic = false) => {
    const bounds = battlefieldForMode(activeMode);
    const fishtankCommit = activeMode === "fishtank" && automatic;
    if (phase !== "planning" || (!fishtankCommit && (!allReady || !allOrdersValid))) return;
    const npcOrders = generateNpcOrders(ships);
    const allOrders: Record<string, Order> = fishtankCommit ? npcOrders : { ...drafts, ...npcOrders };
    const result = resolveTurn({
      turn,
      ships,
      orders: allOrders,
      bounds,
      ...(fishtankCommit ? { activationTeamOrder: fishtankActivationOrder(turn) } : {}),
    });
    setPhase("executing");
    setLog((current) => [
      activeMode === "fishtank"
        ? `Turn ${turn}: both AI fleets released their vectors.`
        : `Turn ${turn}: vectors move simultaneously; impacts resolve before ordered fire.`,
      ...current,
    ].slice(0, 8));
    setResolution(result);
  }, [activeMode, allOrdersValid, allReady, drafts, generateNpcOrders, phase, ships, turn]);

  const resolveCombat = useCallback((finished: Resolution) => {
    const bounds = battlefieldForMode(activeMode);
    const finalized = finalizeTurn(finished, bounds);
    const results = finalized.ships;
    setShips(results);
    setResolution(null);
    setLog((current) => [...finalized.outcomes, ...current].slice(0, 12));

    const enemyAlive = results.some((ship) => ship.team === "enemy" && ship.hull > 0);
    const playerAlive = results.some((ship) => ship.team === "player" && ship.hull > 0);
    const fishtankAllyAlive = results.some((ship) => ship.team === "ally" && ship.hull > 0);
    if (activeMode === "story" && !playerAlive) {
      setPhase("defeat");
      setStoryRun((current) => current ? {
        ...current,
        stage: "lost",
        history: [`Fleet destroyed at Gate ${String(current.gate).padStart(2, "0")}.`, ...current.history].slice(0, 12),
      } : current);
      setScreen("story");
      return;
    }
    if (!enemyAlive) {
      setPhase("victory");
      return;
    }
    if (activeMode === "fishtank" && !fishtankAllyAlive) {
      setPhase("defeat");
      return;
    }
    if (activeMode !== "fishtank" && !playerAlive) {
      setPhase("defeat");
      return;
    }

    setTurn((current) => current + 1);
    setPhase("planning");
    setStaged(new Set());
    setDrafts(buildDrafts(results, bounds));
    const nextPlayer = results.find((ship) => ship.team === "player" && ship.hull > 0);
    if (nextPlayer) setSelectedShipId(nextPlayer.id);
  }, [activeMode]);

  const loadCombatState = useCallback((nextShips: Ship[], nextLog: string[], bounds: BattlefieldBounds) => {
    const encounterShips = copyShips(nextShips);
    const firstPlayer = encounterShips.find((ship) => ship.team === "player" && ship.hull > 0);
    setShips(encounterShips);
    setDrafts(buildDrafts(encounterShips, bounds));
    setStaged(new Set());
    setSelectedShipId(firstPlayer?.id ?? "");
    setPhase("planning");
    setTurn(1);
    setLog(nextLog);
    setResolution(null);
    setCombatFocus(null);
    setCameraCommand({ kind: "reset", nonce: Date.now() });
  }, []);

  const resetGame = useCallback(() => {
    loadCombatState(INITIAL_SHIPS, INITIAL_LOG, FLEET_BATTLEFIELD);
  }, [loadCombatState]);

  const startStoryCampaign = useCallback(() => {
    const starter = createStoryStarter();
    setStoryRun(createStoryRun());
    loadCombatState([starter], STORY_INITIAL_LOG, STORY_BATTLEFIELD);
    setActiveMode("story");
    setSelectedMode("story");
    setScreen("story");
  }, [loadCombatState]);

  const startFishtankMatch = useCallback(() => {
    const nextMatch = fishtankMatchRef.current + 1;
    fishtankMatchRef.current = nextMatch;
    setFishtankMatch(nextMatch);
    setStoryRun(null);
    loadCombatState(createFishtankFleet(INITIAL_SHIPS, nextMatch), [
      `Fishtank match ${String(nextMatch).padStart(2, "0")}: two autonomous five-ship fleets connected.`,
      "AI captains are calculating the opening movement phase.",
    ], FLEET_BATTLEFIELD);
    setActiveMode("fishtank");
    setSelectedMode("fishtank");
    setScreen("battle");
  }, [loadCombatState]);

  const enterStoryGate = useCallback((gate: number) => {
    if (!storyRun || storyActionLockRef.current || gate < 1 || gate > STORY_GATE_COUNT) return;
    storyActionLockRef.current = true;
    const prepared = prepareStoryBattle(ships, gate, storyRun.pendingThreats);
    const pursuitLog = prepared.triggeredThreats.length
      ? [`${prepared.triggeredThreats.length} delayed pursuit signal${prepared.triggeredThreats.length === 1 ? " has" : "s have"} resolved into hostile contacts.`]
      : [];
    loadCombatState(prepared.ships, [
      `Warp Gate ${String(gate).padStart(2, "0")}: ${prepared.config.name}. ${prepared.config.threat}.`,
      ...pursuitLog,
      "Stage each directly controlled ship. AI wingmates calculate their doctrine orders when the turn commits.",
    ], STORY_BATTLEFIELD);
    setStoryRun((current) => current ? {
      ...current,
      stage: "combat",
      gate,
      salvageOptions: [],
      currentEncounter: null,
      selectedChoiceLabel: "",
      outcome: null,
      pendingThreats: prepared.remainingThreats,
      history: [
        ...(prepared.triggeredThreats.length ? [`Pursuit caught the fleet at Gate ${String(gate).padStart(2, "0")}.`] : []),
        `Entered Gate ${String(gate).padStart(2, "0")}: ${prepared.config.name}.`,
        ...current.history,
      ].slice(0, 12),
    } : current);
    setScreen("battle");
  }, [loadCombatState, ships, storyRun]);

  const completeStoryGate = useCallback(() => {
    if (!storyRun || storyActionLockRef.current || activeMode !== "story" || phase !== "victory") return;
    storyActionLockRef.current = true;
    const fleet = retainStoryPlayerFleet(copyShips(ships)).filter((ship) => !ship.spawnedByShipId);
    setShips(fleet);
    if (storyRun.gate >= STORY_GATE_COUNT) {
      setStoryRun((current) => current ? {
        ...current,
        stage: "won",
        clearedGates: STORY_GATE_COUNT,
        history: ["Gate 10 broken. Safe-space vector acquired.", ...current.history].slice(0, 12),
      } : current);
      setScreen("story");
      return;
    }
    const options = pickSalvageOptions(Math.random, 3, storyRun.acquiredEliteIds);
    setStoryRun((current) => current ? {
      ...current,
      stage: "salvage",
      clearedGates: current.gate,
      salvageOptions: options,
      currentEncounter: null,
      selectedChoiceLabel: "",
      outcome: null,
      history: [`Gate ${String(current.gate).padStart(2, "0")} blockade destroyed.`, ...current.history].slice(0, 12),
    } : current);
    setScreen("story");
  }, [activeMode, phase, ships, storyRun]);

  const chooseStorySalvage = useCallback((option: SalvageOption) => {
    if (!storyRun || storyRun.stage !== "salvage" || storyActionLockRef.current) return;
    storyActionLockRef.current = true;
    const applied = applyStoryEffects(ships, option.effects, storyRun.gate, option.id);
    const encounter = pickStoryEncounter(storyRun.seenEncounterIds);
    setShips(applied.ships);
    setStoryRun((current) => current ? {
      ...current,
      stage: "encounter",
      currentEncounter: encounter,
      seenEncounterIds: current.seenEncounterIds.includes(encounter.id) ? current.seenEncounterIds : [...current.seenEncounterIds, encounter.id],
      pendingThreats: [...current.pendingThreats, ...applied.threats],
      acquiredEliteIds: option.rarity === "elite" && !current.acquiredEliteIds.includes(option.id)
        ? [...current.acquiredEliteIds, option.id]
        : current.acquiredEliteIds,
      history: [`Salvaged ${option.label.toLowerCase()}: ${option.effectLabel}.`, ...current.history].slice(0, 12),
    } : current);
  }, [ships, storyRun]);

  const chooseStoryEncounter = useCallback((choiceIndex: number) => {
    if (!storyRun || storyRun.stage !== "encounter" || !storyRun.currentEncounter || storyActionLockRef.current) return;
    const choice = storyRun.currentEncounter.choices[choiceIndex];
    if (!choice) return;
    storyActionLockRef.current = true;
    const fortune = storyRun.fortuneMap[storyRun.currentEncounter.id] === choice.id ? 18 : -18;
    const outcome = rollStoryOutcome(choice, Math.random, fortune);
    const applied = applyStoryEffects(ships, outcome.effects, storyRun.gate, outcome.id);
    const playerAlive = applied.ships.some((ship) => ship.team === "player" && ship.hull > 0);
    setShips(applied.ships);
    setStoryRun((current) => current ? {
      ...current,
      stage: playerAlive ? "outcome" : "lost",
      selectedChoiceLabel: choice.label,
      outcome,
      pendingThreats: [...current.pendingThreats, ...applied.threats],
      history: [`${outcome.title}: ${outcome.effectLabel}.`, ...current.history].slice(0, 12),
    } : current);
  }, [ships, storyRun]);

  const continueStory = useCallback(() => {
    if (!storyRun || storyRun.stage !== "outcome") return;
    enterStoryGate(storyRun.gate + 1);
  }, [enterStoryGate, storyRun]);

  const launchMode = useCallback((mode: GameMode) => {
    setSelectedMode(mode);
    setActiveMode(mode);
    setStoryRun(null);
    if (mode === "story") {
      startStoryCampaign();
      return;
    }
    if (mode === "fishtank") {
      startFishtankMatch();
      return;
    }
    resetGame();
    setScreen("battle");
  }, [resetGame, startFishtankMatch, startStoryCampaign]);

  const returnToMenu = useCallback(() => {
    resetGame();
    setStoryRun(null);
    setScreen("menu");
  }, [resetGame]);

  const restartActiveMode = useCallback(() => {
    if (activeMode === "story") {
      startStoryCampaign();
      return;
    }
    if (activeMode === "fishtank") {
      startFishtankMatch();
      return;
    }
    resetGame();
  }, [activeMode, resetGame, startFishtankMatch, startStoryCampaign]);

  useEffect(() => {
    if (activeMode !== "fishtank" || screen !== "battle" || phase !== "planning" || resolution) return;
    const timer = window.setTimeout(
      () => executeTurn(true),
      scaledAnimationDuration(FISHTANK_PLANNING_DELAY_MS, animationSpeed),
    );
    return () => window.clearTimeout(timer);
  }, [activeMode, animationSpeed, executeTurn, phase, resolution, screen]);

  useEffect(() => {
    if (activeMode !== "fishtank" || screen !== "battle" || (phase !== "victory" && phase !== "defeat")) return;
    const timer = window.setTimeout(
      startFishtankMatch,
      scaledAnimationDuration(FISHTANK_RESTART_DELAY_MS, animationSpeed),
    );
    return () => window.clearTimeout(timer);
  }, [activeMode, animationSpeed, phase, screen, startFishtankMatch]);

  const selectShip = useCallback((id: string) => {
    if (activeMode === "fishtank") return;
    const clicked = ships.find((ship) => ship.id === id);
    if (!clicked) return;
    if (clicked.team !== "enemy" && clicked.hull > 0) {
      setSelectedShipId(id);
      return;
    }
    if (selectedShip?.controller === "player" && clicked.team === "enemy" && clicked.hull > 0) {
      updateDraft({ targetId: id });
    }
  }, [activeMode, ships, selectedShip, updateDraft]);

  useEffect(() => {
    if (screen !== "battle") return;
    const handleShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (phase !== "executing" && event.key.toLowerCase() === "f") {
        setCameraCommand({ kind: "focus", shipId: selectedShipId, nonce: Date.now() });
      }
      if (phase !== "executing" && event.key === "1") setCameraCommand({ kind: "reset", nonce: Date.now() });
      if (event.key === "Escape" && selectedShip?.controller === "player" && phase === "planning") {
        setDrafts((current) => ({ ...current, [selectedShip.id]: defaultOrderFor(selectedShip, ships, battlefieldBounds) }));
        setStaged((current) => {
          const next = new Set(current);
          next.delete(selectedShip.id);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [selectedShipId, selectedShip, ships, phase, screen, battlefieldBounds]);

  if (screen === "menu") {
    return (
      <MainMenu
        selectedMode={selectedMode}
        audioSettings={audioSettings}
        modelVariant={modelVariant}
        onSelectMode={setSelectedMode}
        onLaunch={launchMode}
        onAudioChange={updateAudioSettings}
        onModelVariantChange={setModelVariant}
      />
    );
  }

  if (screen === "story" && storyRun) {
    return (
      <StoryCampaignScreen
        run={storyRun}
        ships={ships}
        onBeginGate={() => enterStoryGate(storyRun.gate)}
        onChooseSalvage={chooseStorySalvage}
        onChooseEncounter={chooseStoryEncounter}
        onContinue={continueStory}
        onRestart={startStoryCampaign}
        onMenu={returnToMenu}
      />
    );
  }

  if (!selectedShip) return null;
  const activeModeInfo = MODE_OPTIONS.find((mode) => mode.id === activeMode) ?? MODE_OPTIONS[1];
  const selectedSizeProfile = SHIP_SIZE_PROFILES[selectedShip.sizeClass];
  const controlsDisabled = phase !== "planning" || selectedShip.controller !== "player" || selectedShip.hull <= 0;
  const selectedFlightMode = selectedDraft?.mode ?? "normal";
  const selectedFlightRule = FLIGHT_MODE_RULES[selectedFlightMode];
  const selectedAiDoctrine = selectedShip.aiDoctrine ?? "standard";
  const selectedAiRule = AI_DOCTRINE_RULES[selectedAiDoctrine];
  const selectedAiCondition = shipConditionScore(selectedShip);
  const selectedIsCarrierFighter = Boolean(selectedShip.spawnedByShipId);
  const translationDisabled = controlsDisabled || selectedFlightMode === "focus-fire";
  const weaponControlDisabled = controlsDisabled || selectedFlightMode !== "normal";
  const selectedWeapons = weaponProfilesFor(selectedShip);
  const selectedPassiveWeapons = passiveWeaponProfilesFor(selectedShip);
  const hasAutonomousTurret = selectedPassiveWeapons.length > 0;
  const selectedSalvos = selectedDraft ? salvosForOrder(selectedDraft) : 1;
  const batteryDamage = selectedWeapons.reduce((sum, weapon) => sum + weapon.damage, 0) * selectedSalvos;
  const formattedMovementLimit = Number.isInteger(movementLimit) ? String(movementLimit) : movementLimit.toFixed(1);
  const plannedTargetDistance = selectedTarget && selectedDraft
    ? distanceBetween(selectedDraft.destination, selectedTarget.position)
    : null;
  const fishtankAllies = ships.filter((ship) => ship.team === "ally");
  const fishtankEnemies = ships.filter((ship) => ship.team === "enemy");
  const livingFishtankAllies = fishtankAllies.filter((ship) => ship.hull > 0);
  const livingFishtankEnemies = fishtankEnemies.filter((ship) => ship.hull > 0);

  return (
    <main className="game-shell" data-mode={activeMode} data-story-phase={activeMode === "story" ? "combat" : undefined} data-gate={activeMode === "story" ? storyRun?.gate : undefined} data-total-gates={activeMode === "story" ? STORY_GATE_COUNT : undefined}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>PARALLAX</strong>
            <span>Fleet tactics simulator</span>
          </div>
        </div>
        <div className="turn-status" aria-live="polite">
          <span className={`phase-dot ${phase}`} />
          <div>
            <small>TURN {String(turn).padStart(2, "0")}</small>
            <strong>{phase === "executing" ? "MOVEMENT + ACTIVATIONS" : activeMode === "fishtank" && phase === "planning" ? "AI CALCULATING" : phase.toUpperCase()}</strong>
          </div>
        </div>
        <div className="mission-brief">
          {activeMode === "story" && storyRun ? (
            <><small>STORY ESCAPE · WARP GATE {String(storyRun.gate).padStart(2, "0")} / {STORY_GATE_COUNT}</small><span>{STORY_GATE_CONFIGS[storyRun.gate - 1]?.name} · {STORY_GATE_CONFIGS[storyRun.gate - 1]?.threat}</span></>
          ) : activeMode === "fishtank" ? (
            <><small>AUTONOMOUS TEST CHAMBER · MATCH {String(fishtankMatch).padStart(2, "0")}</small><span>AZURE AI {livingFishtankAllies.length} · {livingFishtankEnemies.length} CRIMSON AI</span></>
          ) : (
            <><small>{activeModeInfo.category.toUpperCase()} · KESTREL REACH</small><span>{activeModeInfo.label} · Prototype encounter</span></>
          )}
        </div>
        <div className="topbar-actions">
          <fieldset className="overlay-label-toggles">
            <legend>Overlay labels</legend>
            <label>
              <input
                type="checkbox"
                checked={overlayLabels.showShipNames}
                aria-label="Show ship names"
                onChange={(event) => setOverlayLabels((current) => ({ ...current, showShipNames: event.target.checked }))}
              />
              <span>Ship names</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={overlayLabels.showHealth}
                aria-label="Show ship health"
                onChange={(event) => setOverlayLabels((current) => ({ ...current, showHealth: event.target.checked }))}
              />
              <span>Health</span>
            </label>
          </fieldset>
          <label className="animation-speed-control">
            <span>Speed</span>
            <input
              type="range"
              min="0"
              max={String(ANIMATION_SPEED_OPTIONS.length - 1)}
              step="1"
              value={animationSpeedIndex(animationSpeed)}
              aria-label="Animation speed"
              aria-valuetext={`${animationSpeed} times speed`}
              onChange={(event) => setAnimationSpeed(animationSpeedAt(Number(event.target.value)))}
            />
            <output>{animationSpeed}×</output>
          </label>
          <button className="quiet-button" type="button" onClick={returnToMenu}>Main menu</button>
          <button className="quiet-button" type="button" onClick={restartActiveMode}>{activeMode === "story" ? "Restart run" : activeMode === "fishtank" ? "New match" : "Restart"}</button>
        </div>
      </header>

      <section className={`battle-layout ${activeMode === "fishtank" ? "fishtank-layout" : ""}`}>
        <div className="viewport-panel">
          <TacticalScene
            ships={ships}
            drafts={drafts}
            staged={staged}
            selectedShipId={selectedShipId}
            selectedTargetId={selectedTargetId}
            resolution={resolution}
            cameraCommand={cameraCommand}
            onSelect={selectShip}
            onCombatFocus={setCombatFocus}
            onResolutionComplete={resolveCombat}
            overlayLabels={overlayLabels}
            animationSpeed={animationSpeed}
            modelVariant={modelVariant}
            battlefieldBounds={battlefieldBounds}
            showFleetStations={showFleetStations}
            presentation={activeMode === "fishtank" ? "spectator" : "command"}
          />

          {activeMode !== "fishtank" && (
          <section className="tactical-telemetry" aria-label="Selected ship shielding and target details">
            <div className="tactical-telemetry__ship">
              <div className="telemetry-heading">
                <span>{selectedSizeProfile.label.toUpperCase()} CLASS · {selectedSizeProfile.fleetPointCost} FLEET PTS · DIRECTIONAL SHIELDING</span>
                <strong>{selectedShip.name} · {Math.round(selectedShip.hull)} / {selectedShip.maxHull} HULL</strong>
              </div>
              <div className="shield-grid">
                {SHIELD_FACES.map((face) => {
                  const shieldRatio = selectedShip.shields[face] / Math.max(1, selectedShip.maxShields[face]);
                  const faceLabel = face === "fore" ? "Front" : face === "aft" ? "Rear" : titleCase(face);
                  return (
                    <div key={face} className={`${face} ${selectedShip.shields[face] <= 0 ? "depleted" : shieldRatio < 0.38 ? "damaged" : ""}`}>
                      <span>{faceLabel}</span><strong>{Math.round(selectedShip.shields[face])} / {Math.round(selectedShip.maxShields[face])}</strong>
                      <i><b style={{ width: `${clamp(shieldRatio * 100, 0, 100)}%` }} /></i>
                    </div>
                  );
                })}
              </div>
              <div className="telemetry-footer">
                {selectedShip.controller === "player" ? (
                  <span className="stance-chip" data-stance={selectedFlightMode}>{selectedFlightRule.label} · {selectedFlightRule.shortRule}</span>
                ) : selectedShip.team !== "enemy" ? (
                  <span className="stance-chip ai" data-doctrine={selectedAiDoctrine}>AI {selectedAiRule.label} · {selectedAiRule.shortRule}</span>
                ) : (
                  <span className="stance-chip hostile">HOSTILE AI · DOCTRINE HIDDEN</span>
                )}
                <small className="shield-regen-note">SHIELD REGEN · +5 AFTER HIT · +10 WHEN CLEAR</small>
              </div>
            </div>

            <div className="tactical-telemetry__target">
              <div className="telemetry-heading">
                <span>TARGET DETAILS</span>
                <strong>{selectedTarget?.callsign ?? "NO ACTIVE LOCK"}</strong>
              </div>
              {selectedShip.controller === "player" && selectedDraft ? (
                <>
                  <label className="target-select">
                    <span>TARGET LOCK</span>
                    <select value={selectedTarget ? selectedDraft.targetId : ""} disabled={controlsDisabled || enemies.length === 0} onChange={(event) => updateDraft({ targetId: event.target.value })}>
                      {enemies.length === 0 && <option value="">NO ACTIVE TARGETS</option>}
                      {enemies.map((enemy) => <option value={enemy.id} key={enemy.id}>{enemy.name} · {Math.round(distanceBetween(selectedDraft.destination, enemy.position))} km</option>)}
                    </select>
                  </label>
                  {selectedTarget && (
                    <div className="target-contact">
                      <span><strong>{selectedTarget.name}</strong><small>{selectedTarget.className}</small></span>
                      <b>{Math.round(selectedTarget.hull)} / {selectedTarget.maxHull} HULL · {plannedTargetDistance?.toFixed(1)} KM</b>
                    </div>
                  )}
                  <div className={`forecast ${forecast?.valid ? "valid" : "warning"}`}>
                    <i />
                    <span>
                      <strong>{!selectedTarget ? "NO ACTIVE TARGET" : selectedFlightMode === "extra-move" ? "EXTRA MOVE · WEAPONS OFFLINE" : selectedSalvos === 0 ? "WEAPONS SAFE" : forecast?.valid ? `${forecast.validCount}/${forecast.total} SHOTS LOCKED` : forecast?.inRange === false ? "OUTSIDE ALL RANGES" : "OUTSIDE FIRING ARCS"}</strong>
                      <small>{forecast ? `${forecast.distance.toFixed(1)} km · ${Math.round(forecast.damage)} projected damage${forecast.salvoCount === 2 ? " · double salvo" : ""}` : selectedTarget ? `${plannedTargetDistance?.toFixed(1)} km · ${selectedFlightMode === "extra-move" ? "firing disabled" : selectedSalvos === 0 ? "fire held" : "no firing solution"}` : "No target selected"}</small>
                    </span>
                  </div>
                </>
              ) : selectedShip.team !== "enemy" ? (
                <div className="target-empty"><strong>AUTONOMOUS TARGETING · {selectedAiRule.label.toUpperCase()}</strong><span>Target, vector, facing, and weapon stance are calculated when the turn is committed.</span></div>
              ) : (
                <div className="target-empty"><strong>HOSTILE ORDERS HIDDEN</strong><span>Predict its maneuver from range, facing, and exposed shielding.</span></div>
              )}
            </div>
          </section>
          )}

          <div className="viewport-heading">
            <span>{activeMode === "fishtank" ? "AUTONOMOUS VOLUME" : "TACTICAL VOLUME"}</span>
            <strong>{activeMode === "fishtank" ? "5 vs 5 · AI vs AI · " : ""}{battlefieldBounds.length} L × {battlefieldBounds.height} H × {battlefieldBounds.width} W KM</strong>
          </div>

          {activeMode === "fishtank" && (
            <section className="fishtank-scoreboard" aria-label="Fishtank fleet status">
              <div className="fishtank-team azure">
                <span>AZURE AI</span>
                <strong>{livingFishtankAllies.length}<small> ACTIVE · {FISHTANK_FLEET_SIZE} CORE</small></strong>
                <FishtankFleetBars ships={fishtankAllies} highlightedIds={cinematicShipIds} />
              </div>
              <div className="fishtank-director" aria-live="polite">
                <small>MATCH {String(fishtankMatch).padStart(2, "0")} · TURN {String(turn).padStart(2, "0")}</small>
                <strong>{phase === "planning" ? "AI ORDERS CALCULATING" : phase === "executing" ? combatFocus ? combatFocus.kind === "collision" ? "COLLISION EVENT" : "WEAPON ACTIVATION" : "SIMULTANEOUS MOVEMENT" : "MATCH COMPLETE"}</strong>
                <span>{phase === "planning" ? "Next movement phase imminent" : phase === "executing" ? combatFocus ? `${combatFocus.left.name} · ${combatFocus.right.name}` : "Both fleets have committed" : "Preparing a fresh simulation"}</span>
              </div>
              <div className="fishtank-team crimson">
                <span>CRIMSON AI</span>
                <strong>{livingFishtankEnemies.length}<small> ACTIVE · {FISHTANK_FLEET_SIZE} CORE</small></strong>
                <FishtankFleetBars ships={fishtankEnemies} highlightedIds={cinematicShipIds} />
              </div>
            </section>
          )}

          {activeMode === "story" && storyRun && (
            <div className="story-combat-progress" aria-label={`Warp gate ${storyRun.gate} of ${STORY_GATE_COUNT}`}>
              <span>ESCAPE ROUTE</span>
              <ol>{Array.from({ length: STORY_GATE_COUNT }, (_, index) => <li key={index} className={index + 1 < storyRun.gate ? "cleared" : index + 1 === storyRun.gate ? "active" : ""}>{index + 1 < storyRun.gate ? "✓" : index + 1}</li>)}</ol>
              <strong>{storyRun.pendingThreats.length ? `${storyRun.pendingThreats.length} SIGNAL${storyRun.pendingThreats.length === 1 ? "" : "S"} IN WAKE` : "WAKE CLEAR"}</strong>
            </div>
          )}

          {activeMode !== "fishtank" && <div className="camera-tools" aria-label="Camera controls">
            <button type="button" disabled={phase === "executing"} onClick={() => setCameraCommand({ kind: "focus", shipId: selectedShipId, nonce: Date.now() })}>Focus <kbd>F</kbd></button>
            <button type="button" disabled={phase === "executing"} onClick={() => setCameraCommand({ kind: "reset", nonce: Date.now() })}>Reset <kbd>1</kbd></button>
            <button type="button" className={helpOpen ? "active" : ""} onClick={() => setHelpOpen((open) => !open)}>Controls</button>
          </div>}

          {activeMode !== "fishtank" && helpOpen && (
            <div className="help-card">
              <button type="button" aria-label="Close camera help" onClick={() => setHelpOpen(false)}>×</button>
              <strong>CAMERA</strong>
              <span><b>Drag</b> orbit · <b>Right drag</b> pan</span>
              <span><b>Wheel / pinch</b> zoom · <b>WASD</b> pan</span>
              <span><b>Click ship</b> select or target</span>
              <span><b>Cone tip</b> ship centre · beams use gun mounts</span>
            </div>
          )}

          {phase === "executing" && combatFocus && (
            <div className={`cinematic-participant-cards ${combatFocus.kind}`} aria-live="polite">
              <article className={`cinematic-ship-card left ${combatFocus.left.team}`}>
                <small>{combatFocus.kind === "collision" ? "CONTACT A" : "FIRING SHIP"}</small>
                <strong>{combatFocus.left.name}</strong>
                <span>{SHIP_SIZE_PROFILES[combatFocus.left.sizeClass].label} · {combatFocus.left.className}</span>
              </article>
              <article className={`cinematic-ship-card right ${combatFocus.right.team}`}>
                <small>{combatFocus.kind === "collision" ? "CONTACT B" : "TARGET SHIP"}</small>
                <strong>{combatFocus.right.name}</strong>
                <span>{SHIP_SIZE_PROFILES[combatFocus.right.sizeClass].label} · {combatFocus.right.className}</span>
              </article>
            </div>
          )}

          {phase === "executing" && (
            <div className={`resolution-banner ${combatFocus ? `${combatFocus.kind === "collision" ? "collision" : "firing"} ${combatFocus.left.team}` : "moving"}`} role="status">
              <span />
              <div>
                <small>{combatFocus ? combatFocus.kind === "collision" ? "COLLISION DETECTED" : `${combatFocus.detail.toUpperCase()} DISCHARGE` : "ORDERS RELEASED"}</small>
                <strong>{combatFocus ? `${combatFocus.left.name} ${combatFocus.kind === "collision" ? "◆" : "→"} ${combatFocus.right.name}` : "Resolving all vectors"}</strong>
              </div>
            </div>
          )}

          {(phase === "victory" || phase === "defeat") && activeMode !== "story" && activeMode !== "fishtank" && (
            <div className="end-state">
              <small>SKIRMISH COMPLETE</small>
              <h2>{phase === "victory" ? "Formation broken" : "Command ships lost"}</h2>
              <p>{phase === "victory" ? "The Kestrel Reach is secure." : "Replot the engagement and try a new vector."}</p>
              <button type="button" onClick={resetGame}>Run another {activeModeInfo.label.toLowerCase()}</button>
            </div>
          )}

          {(phase === "victory" || phase === "defeat") && activeMode === "fishtank" && (
            <div className={`end-state fishtank-end ${phase}`}>
              <small>FISHTANK MATCH {String(fishtankMatch).padStart(2, "0")} COMPLETE</small>
              <h2>{phase === "victory" ? "Azure fleet prevails" : "Crimson fleet prevails"}</h2>
              <p>A fresh five-versus-five simulation is entering the chamber.</p>
            </div>
          )}

          {(phase === "victory" || phase === "defeat") && activeMode === "story" && storyRun && (
            <div className={`end-state story-battle-end ${phase}`}>
              <small>{phase === "victory" ? `WARP GATE ${String(storyRun.gate).padStart(2, "0")} CLEARED` : "ESCAPE FORMATION LOST"}</small>
              <h2>{phase === "victory" ? (storyRun.gate === STORY_GATE_COUNT ? "The final blockade breaks" : "The aperture is yours") : "Hostile retrieval complete"}</h2>
              <p>{phase === "victory" ? (storyRun.gate === STORY_GATE_COUNT ? "Only open space remains beyond the gate." : "Salvage one system before the wrecks fall into the wake.") : `The Hammerhead was stopped at Gate ${String(storyRun.gate).padStart(2, "0")}. Every upgrade and recruit is lost with the run.`}</p>
              <button type="button" onClick={phase === "victory" ? completeStoryGate : startStoryCampaign}>{phase === "victory" ? (storyRun.gate === STORY_GATE_COUNT ? "Cross into safe space" : "Claim salvage") : "Start a new escape"}</button>
              {phase === "defeat" && <button type="button" className="end-state-secondary" onClick={returnToMenu}>Return to main menu</button>}
            </div>
          )}

          {activeMode !== "fishtank" && <div className="fleet-dock" aria-label="Player fleet orders">
            <div className="dock-title">
              <small>COMMAND WING</small>
              <strong>{livingCommandShips.length ? `${readyCount}/${livingCommandShips.length} VECTORS STAGED` : "AI WING AUTONOMOUS"}</strong>
            </div>
            <div className="ship-tabs">
              {playerShips.map((ship, index) => (
                <button
                  type="button"
                  key={ship.id}
                  className={`${selectedShipId === ship.id ? "selected" : ""} ${ship.hull <= 0 ? "destroyed" : ""} ${cinematicShipIds.has(ship.id) ? "cinematic-active" : ""}`}
                  onClick={() => ship.hull > 0 && setSelectedShipId(ship.id)}
                >
                  <span className="ship-index">0{index + 1}</span>
                  <span><strong>{ship.name}</strong><small>{ship.hull <= 0 ? "DESTROYED" : `${SHIP_SIZE_PROFILES[ship.sizeClass].label.toUpperCase()} · ${ship.controller === "ai" ? `AI ${AI_DOCTRINE_RULES[ship.aiDoctrine ?? "standard"].label.toUpperCase()}` : staged.has(ship.id) ? "ORDER READY" : "DRAFT VECTOR"}`}</small></span>
                  <i className={ship.hull > 0 && (ship.controller === "ai" || staged.has(ship.id)) ? "ready" : ""} />
                </button>
              ))}
            </div>
            <button className="execute-button" type="button" disabled={!allReady || phase !== "planning"} onClick={() => executeTurn()}>
              <span>{phase === "executing" ? "RESOLVING" : allReady ? (livingCommandShips.length ? "EXECUTE TURN" : "EXECUTE AI TURN") : `${livingCommandShips.length - readyCount} ORDER${livingCommandShips.length - readyCount === 1 ? "" : "S"} NEEDED`}</span>
              <b aria-hidden="true">→</b>
            </button>
          </div>}
        </div>

        {activeMode !== "fishtank" && <aside className="command-panel">
          {selectedShip.controller === "player" && selectedDraft && (
            <div className="command-confirmation">
              <button className={`stage-button ${staged.has(selectedShip.id) ? "staged" : ""}`} type="button" disabled={controlsDisabled || !orderReady} aria-describedby={`stance-status-${selectedShip.id} plot-status-${selectedShip.id}`} onClick={() => setStaged((current) => new Set(current).add(selectedShip.id))}>
                <span>{!destinationValid ? "MOVE OUTSIDE RANGE" : selectedFlightMode === "focus-fire" && !selectedTarget ? "FOCUS TARGET REQUIRED" : staged.has(selectedShip.id) ? "ORDER CONFIRMED" : `CONFIRM ${selectedFlightRule.label.toUpperCase()} ORDER`}</span><b>{staged.has(selectedShip.id) ? "✓" : "→"}</b>
              </button>
            </div>
          )}

          <section className="ship-identity">
            <div>
              <span className="eyebrow">{TEAM_LABELS[selectedShip.team]} · {selectedShip.callsign}</span>
              <h1>{selectedShip.name}</h1>
              <p>{selectedShip.className} · {selectedSizeProfile.label} class · {selectedSizeProfile.fleetPointCost} fleet points</p>
            </div>
            <span className={`team-glyph ${selectedShip.team}`} aria-hidden="true" />
          </section>

          {selectedShip.controller === "player" && selectedDraft ? (
            <>
              <section className="stance-block">
                <div className="section-heading stepped"><span><b>01</b>TURN STANCE</span><strong>CHOOSE TRADE-OFF</strong></div>
                <fieldset className="stance-options">
                  <legend>Choose movement and firing priority</legend>
                  {FLIGHT_MODE_ORDER.map((mode) => {
                    const rule = FLIGHT_MODE_RULES[mode];
                    const inputId = `stance-${selectedShip.id}-${mode}`;
                    return (
                      <label className="stance-option" data-stance={mode} key={mode} htmlFor={inputId} aria-label={`${rule.label}: ${rule.description}`}>
                        <input id={inputId} type="radio" name={`stance-${selectedShip.id}`} value={mode} checked={selectedFlightMode === mode} disabled={controlsDisabled} aria-label={rule.label} onChange={() => updateFlightMode(mode)} />
                        <span><strong>{rule.label}</strong><small>{rule.shortRule}</small></span>
                      </label>
                    );
                  })}
                </fieldset>
                <div id={`stance-status-${selectedShip.id}`} className="stance-status" data-stance={selectedFlightMode} role="status" aria-live="polite">
                  <strong>{selectedFlightRule.label}</strong>
                  <span>{selectedFlightMode === "focus-fire" ? "0 KM · DOUBLE VOLLEY · TRANSLATION LOCKED" : selectedFlightMode === "extra-move" ? `${formattedMovementLimit} KM · MAIN BATTERY OFFLINE${hasAutonomousTurret ? " · TURRETS ACTIVE" : ""}` : `${formattedMovementLimit} KM · SINGLE VOLLEY AVAILABLE`}</span>
                  <p>{selectedFlightRule.description}</p>
                </div>
              </section>

              <section className={`orders-block location-block ${selectedFlightMode === "focus-fire" ? "translation-locked" : ""}`}>
                <div className="section-heading stepped"><span><b>02</b>TARGET LOCATION</span><strong>SHIP-RELATIVE</strong></div>
                <div id={`plot-status-${selectedShip.id}`} className={`plot-status ${selectedFlightMode === "focus-fire" ? "locked" : destinationValid ? "valid" : "invalid"}`}>
                  <span>{selectedFlightMode === "focus-fire" ? "FOCUS FIRE RULE" : "LOCAL VECTOR LENGTH"}</span>
                  <strong>{selectedFlightMode === "focus-fire" ? "POSITION LOCKED" : `${plottedDistance.toFixed(1)} / ${formattedMovementLimit} KM`}</strong>
                  <i><b style={{ width: `${movementLimit === 0 ? 100 : Math.min(100, (plottedDistance / movementLimit) * 100)}%` }} /></i>
                </div>
                {selectedFlightMode === "focus-fire" && <p className="automatic-rule">TRANSLATION LOCKED BY FOCUS FIRE</p>}
                <SliderControl label="Forward / back" axis="F" value={relativeMovement.forward} min={-movementLimit} max={movementLimit} suffix=" km" step={0.25} decimals={2} lowLabel="BACK" highLabel="FORWARD" disabled={translationDisabled} onChange={(value) => updateRelativeMovement("forward", value)} />
                <SliderControl label="Left / right" axis="R" value={relativeMovement.right} min={-movementLimit} max={movementLimit} suffix=" km" step={0.25} decimals={2} lowLabel="LEFT" highLabel="RIGHT" disabled={translationDisabled} onChange={(value) => updateRelativeMovement("right", value)} />
                <SliderControl label="Up / down" axis="U" value={relativeMovement.up} min={-movementLimit} max={movementLimit} suffix=" km" step={0.25} decimals={2} lowLabel="DOWN" highLabel="UP" disabled={translationDisabled} onChange={(value) => updateRelativeMovement("up", value)} />
                <div className="quick-actions">
                  <button type="button" disabled={translationDisabled} onClick={() => updateDraft({ destination: [...selectedShip.position] as Vec3 })}>Hold position</button>
                  <button type="button" disabled={translationDisabled} onClick={() => updateDraft({ destination: destinationFromManeuver(selectedShip, movementLimit * 0.6, 0, 0, 0, selectedFlightMode, battlefieldBounds) })}>Forward 60%</button>
                </div>
              </section>

              <section className="orders-block orientation-block">
                <div className="section-heading stepped"><span><b>03</b>FINAL ORIENTATION</span><strong>3-AXIS ATTITUDE</strong></div>
                <SliderControl label="Turn left / right" axis="Y" value={selectedDraft.turn} min={-selectedShip.maxTurn} max={selectedShip.maxTurn} suffix="°" lowLabel="LEFT" highLabel="RIGHT" disabled={controlsDisabled} onChange={(turnValue) => updateDraft({ turn: turnValue })} />
                <SliderControl label="Nose down / up" axis="X" value={selectedDraft.pitch} min={-selectedShip.maxPitch} max={selectedShip.maxPitch} suffix="°" lowLabel="DOWN" highLabel="UP" disabled={controlsDisabled} onChange={(pitch) => updateDraft({ pitch })} />
                <SliderControl label="Roll left / right" axis="Z" value={selectedDraft.roll} min={-selectedShip.maxRoll} max={selectedShip.maxRoll} suffix="°" lowLabel="LEFT" highLabel="RIGHT" disabled={controlsDisabled} onChange={(roll) => updateDraft({ roll })} />
                <div className="quick-actions">
                  <button type="button" disabled={controlsDisabled || !selectedDraft.targetId} onClick={faceTarget}>Face target</button>
                  <button type="button" disabled={controlsDisabled} onClick={() => updateDraft({ turn: 0, pitch: 0, roll: 0 })}>Hold orientation</button>
                </div>
              </section>

              <section className="weapon-block">
                <div className="section-heading stepped"><span><b>04</b>WEAPON BATTERY</span><strong>{selectedSalvos ? `${batteryDamage} DAMAGE · ${selectedSalvos} SALVO${selectedSalvos === 1 ? "" : "S"}` : "WEAPONS OFFLINE"}</strong></div>
                <button type="button" className={`weapon-toggle ${selectedDraft.fire ? "armed" : ""} ${selectedFlightMode}`} disabled={weaponControlDisabled} onClick={() => updateDraft({ fire: !selectedDraft.fire })}>
                  <i />
                  <span>{selectedFlightMode === "focus-fire" ? `${selectedWeapons.length} MOUNTS · DOUBLE VOLLEY` : selectedFlightMode === "extra-move" ? hasAutonomousTurret ? "MAIN BATTERY SAFE · TURRETS ACTIVE" : "WEAPONS AUTOMATICALLY SAFE" : selectedDraft.fire ? `${selectedWeapons.length} GUN${selectedWeapons.length === 1 ? "" : "S"} ARMED` : "HOLD FIRE"}</span>
                  <b>{selectedFlightMode === "focus-fire" ? "2×" : selectedFlightMode === "extra-move" ? "DRIVE" : selectedDraft.fire ? "LIVE" : "SAFE"}</b>
                </button>
                {hasAutonomousTurret && (
                  <div className="passive-trait-status">
                    <span><i />PASSIVE TRAIT · TURRETS</span>
                    <strong>{selectedPassiveWeapons[0].damage} DAMAGE · {selectedPassiveWeapons[0].range.toFixed(1)} KM · 360°</strong>
                    <p>Fires once every activation at the weakest hostile in range, independent of orientation, target orders, and flight mode.</p>
                  </div>
                )}
              </section>
            </>
          ) : selectedShip.controller === "ai" && selectedShip.team !== "enemy" ? (
            <section className="npc-block doctrine-block">
              <span className="eyebrow">AI WINGMATE · AUTONOMOUS COMMAND</span>
              <h2>{selectedIsCarrierFighter ? "Disposable strike doctrine" : "Set tactical doctrine"}</h2>
              <p>{selectedIsCarrierFighter
                ? `${selectedShip.name} is carrier-launched strike craft and will press its attack regardless of damage. Its one-use evasive manoeuvre diverts a collision course but forfeits that turn's attack.`
                : `You set intent; ${selectedShip.name} weighs its hull role, shielding, weapon range, and incoming threats before choosing its order.`}</p>
              <fieldset className="doctrine-options">
                <legend>Choose the wingmate&apos;s standing order</legend>
                {AI_DOCTRINE_ORDER.map((doctrine) => {
                  const rule = AI_DOCTRINE_RULES[doctrine];
                  const inputId = `doctrine-${selectedShip.id}-${doctrine}`;
                  return (
                    <label className="doctrine-option" data-doctrine={doctrine} key={doctrine} htmlFor={inputId} aria-label={`${rule.label}: ${rule.description}`}>
                      <input id={inputId} type="radio" name={`doctrine-${selectedShip.id}`} checked={selectedAiDoctrine === doctrine} disabled={selectedIsCarrierFighter || phase !== "planning" || selectedShip.hull <= 0} aria-label={rule.label} onChange={() => updateAiDoctrine(doctrine)} />
                      <span><strong>{rule.label}</strong><small>{rule.shortRule}</small></span>
                    </label>
                  );
                })}
              </fieldset>
              <div className="doctrine-status" data-doctrine={selectedAiDoctrine} role="status" aria-live="polite">
                <span><strong>{selectedAiRule.label} doctrine</strong><b>{Math.round(selectedAiCondition * 100)}% COMBAT CONDITION</b></span>
                <p>{selectedAiRule.description}</p>
                <small>{selectedIsCarrierFighter
                  ? selectedShip.evasiveManeuverAvailable
                    ? "EVASION READY · AUTO-DODGE FORFEITS ATTACK"
                    : "EVASION SPENT · DISPOSABLE ATTACK RUN"
                  : "AI READY · HULL-AWARE ORDER CALCULATED ON COMMIT"}</small>
              </div>
            </section>
          ) : (
            <section className="npc-block">
              <span className="eyebrow">AUTONOMOUS COMMAND</span>
              <h2>Hostile vector hidden</h2>
              <p>Predict its maneuver from current facing, range, and exposed shielding.</p>
            </section>
          )}

          <section className="combat-log">
            <div className="section-heading"><span>TACTICAL FEED</span><strong>LIVE</strong></div>
            <ol>
              {log.slice(0, 4).map((entry, index) => <li key={`${entry}-${index}`}><span>{String(turn).padStart(2, "0")}.{String(index + 1).padStart(2, "0")}</span><p>{entry}</p></li>)}
            </ol>
            {alliedNPCs.length > 0 && <div className="ally-status"><i /><span>AI WING · {alliedNPCs.length} AUTONOMOUS</span><strong>{Math.round((alliedNPCs.reduce((sum, ship) => sum + shipConditionScore(ship), 0) / alliedNPCs.length) * 100)}%</strong></div>}
          </section>
        </aside>}
      </section>
    </main>
  );
}
