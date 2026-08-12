import assert from "node:assert/strict";
import test from "node:test";
import { FLEET_BATTLEFIELD } from "../app/battlefieldConfig.ts";
import { endStateForOrder, finalizeTurn, resolveAndFinalizeTurn, resolveTurn } from "../app/gameEngine.ts";
import {
  GAME_RULES_VERSION,
  GAME_STATE_SCHEMA_VERSION,
  createMatchState,
  type GameShip,
  type TurnOrder,
} from "../app/gameTypes.ts";
import { createShipFromArchetype } from "../app/shipFactory.ts";
import { SHIP_ARCHETYPES } from "../app/shipCatalog.ts";

const holdOrder = (targetId: string, position: GameShip["position"], fire = true): TurnOrder => ({
  destination: [...position],
  turn: 0,
  pitch: 0,
  roll: 0,
  targetId,
  fire,
  mode: "normal",
});

function duelShips() {
  const attacker = createShipFromArchetype(SHIP_ARCHETYPES.hammerhead, {
    id: "attacker",
    team: "player",
    controller: "player",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  const target = createShipFromArchetype(SHIP_ARCHETYPES.hulk, {
    id: "target",
    team: "enemy",
    controller: "ai",
    position: [0, 0, -8],
    rotation: [0, 180, 0],
  });
  return { attacker, target };
}

test("shared turn resolution is deterministic, immutable, and JSON serializable", () => {
  const { attacker, target } = duelShips();
  const ships = [attacker, target];
  const orders = {
    [attacker.id]: holdOrder(target.id, attacker.position),
    [target.id]: holdOrder(attacker.id, target.position, false),
  };
  const sourceSnapshot = JSON.stringify({ ships, orders });

  const first = resolveTurn({ turn: 4, ships, orders, bounds: FLEET_BATTLEFIELD });
  const second = resolveTurn({ turn: 4, ships, orders, bounds: FLEET_BATTLEFIELD });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ ships, orders }), sourceSnapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(first.turn, 4);
  assert.ok(first.shots.some((shot) => shot.shooterId === attacker.id && shot.valid));
});

test("submitted movement and rotation are constrained by the shared engine", () => {
  const { attacker } = duelShips();
  const order: TurnOrder = {
    ...holdOrder("target", attacker.position),
    destination: [999, 999, 999],
    turn: 999,
    pitch: -999,
    roll: 999,
  };

  const end = endStateForOrder(attacker, order, FLEET_BATTLEFIELD);

  assert.ok(Math.hypot(
    end.position[0] - attacker.position[0],
    end.position[1] - attacker.position[1],
    end.position[2] - attacker.position[2],
  ) <= attacker.maxMove + 1e-9);
  assert.deepEqual(end.rotation, [-40, 55, 90]);
  assert.deepEqual(attacker.position, [0, 0, 0]);
});

test("turn finalization remembers targets and applies carrier launches without mutation", () => {
  const carrier = createShipFromArchetype(SHIP_ARCHETYPES.carrier, {
    id: "carrier",
    team: "player",
    controller: "ai",
    aiDoctrine: "standard",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  const target = createShipFromArchetype(SHIP_ARCHETYPES.hulk, {
    id: "target",
    team: "enemy",
    controller: "ai",
    position: [0, 0, -30],
    rotation: [0, 180, 0],
  });
  const orders = {
    [carrier.id]: holdOrder(target.id, carrier.position, false),
    [target.id]: holdOrder(carrier.id, target.position, false),
  };
  const sourceSnapshot = JSON.stringify({ carrier, target, orders });
  const resolution = resolveTurn({ turn: 1, ships: [carrier, target], orders });

  const finalized = finalizeTurn(resolution);
  const fighter = finalized.ships.find((ship) => ship.spawnedByShipId === carrier.id);

  assert.equal(JSON.stringify({ carrier, target, orders }), sourceSnapshot);
  assert.equal(finalized.ships.find((ship) => ship.id === carrier.id)?.lastTargetId, target.id);
  assert.ok(fighter);
  assert.equal(fighter.evasiveManeuverAvailable, true);
  assert.ok(fighter.passiveTraits?.some((trait) => trait.kind === "evasive-maneuver"));
  assert.equal(finalized.launches.length, 1);
});

test("combined server entry point and versioned match state are serializable", () => {
  const { attacker, target } = duelShips();
  const orders = {
    [attacker.id]: holdOrder(target.id, attacker.position),
    [target.id]: holdOrder(attacker.id, target.position, false),
  };
  const state = createMatchState({
    matchId: "TEST-001",
    mode: "skirmish",
    turn: 1,
    phase: "planning",
    ships: [attacker, target],
  });
  const result = resolveAndFinalizeTurn({ turn: state.turn, ships: state.ships, orders });

  assert.equal(state.schemaVersion, GAME_STATE_SCHEMA_VERSION);
  assert.equal(state.rulesVersion, GAME_RULES_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
