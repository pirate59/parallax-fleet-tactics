import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMultiplayerControls,
  canonicalTeamForSide,
  createMultiplayerMatchState,
  DEFAULT_MULTIPLAYER_FLEET,
  multiplayerControlsForSide,
  MULTIPLAYER_FLEET_SIZE,
  multiplayerTimeoutOrders,
  multiplayerTurnDuration,
  multiplayerWinnerAfterConcession,
  MULTIPLAYER_TIMEOUT_TURN_MS,
  MULTIPLAYER_TURN_MS,
  resolveMultiplayerTurn,
  replaceMultiplayerSideFleet,
  stateForMultiplayerPerspective,
  validateMultiplayerControls,
  validateMultiplayerFleetSelection,
  validateMultiplayerOrders,
} from "../app/multiplayerMode.ts";
import type { GameShip, TurnOrder, TurnOrders } from "../app/gameTypes.ts";

const holdOrder = (ship: GameShip, targetId: string): TurnOrder => ({
  destination: [...ship.position],
  turn: 0,
  pitch: 0,
  roll: 0,
  targetId,
  fire: true,
  mode: "normal",
});

function completeOrders(state: ReturnType<typeof createMultiplayerMatchState>, side: "host" | "guest") {
  const team = canonicalTeamForSide(side);
  const target = state.ships.find((ship) => ship.team !== team && ship.hull > 0)!;
  return Object.fromEntries(
    state.ships
      .filter((ship) => ship.team === team && ship.hull > 0)
      .map((ship) => [ship.id, holdOrder(ship, target.id)]),
  ) as TurnOrders;
}

test("multiplayer creates one Large, three Cruisers, and one Fighter per commander", () => {
  const state = createMultiplayerMatchState("ABC234");
  const host = state.ships.filter((ship) => ship.team === "player");
  const guest = state.ships.filter((ship) => ship.team === "enemy");

  assert.equal(host.length, MULTIPLAYER_FLEET_SIZE);
  assert.equal(guest.length, MULTIPLAYER_FLEET_SIZE);
  for (const fleet of [host, guest]) {
    assert.equal(fleet.filter((ship) => ship.sizeClass === "large").length, 1);
    assert.equal(fleet.filter((ship) => ship.sizeClass === "cruiser").length, 3);
    assert.equal(fleet.filter((ship) => ship.sizeClass === "shuttle").length, 1);
  }
  assert.deepEqual(host.map((ship) => ship.archetypeId), guest.map((ship) => ship.archetypeId));
  assert.ok(state.ships.every((ship) => ship.controller === "player"));
  assert.equal(state.mode, "multiplayer");
});

test("fleet selections allow repeated Cruisers and reject invalid compositions", () => {
  const selection = validateMultiplayerFleetSelection({
    large: "carrier",
    cruisers: ["archer", "archer", "hulk"],
    fighter: "fighter",
  });
  const state = replaceMultiplayerSideFleet(createMultiplayerMatchState("ABC234"), "guest", selection);
  const guest = state.ships.filter((ship) => ship.team === "enemy");

  assert.deepEqual(guest.map((ship) => ship.archetypeId), ["carrier", "archer", "archer", "hulk", "fighter"]);
  assert.equal(new Set(guest.map((ship) => ship.id)).size, 5);
  assert.throws(() => validateMultiplayerFleetSelection({ ...DEFAULT_MULTIPLAYER_FLEET, cruisers: ["archer", "hulk"] }), /exactly three/);
  assert.throws(() => validateMultiplayerFleetSelection({ ...DEFAULT_MULTIPLAYER_FLEET, large: "hammerhead" }), /Large/);
});

test("guest perspective makes the guest fleet friendly without changing stable IDs", () => {
  const state = createMultiplayerMatchState("ABC234");
  const view = stateForMultiplayerPerspective(state, "guest");
  const canonicalGuest = state.ships.find((ship) => ship.id === "multiplayer-guest-hammerhead")!;
  const viewedGuest = view.ships.find((ship) => ship.id === canonicalGuest.id)!;
  const viewedHost = view.ships.find((ship) => ship.id === "multiplayer-host-hammerhead")!;

  assert.equal(canonicalGuest.team, "enemy");
  assert.equal(viewedGuest.team, "player");
  assert.equal(viewedHost.team, "enemy");
  assert.deepEqual(viewedGuest.position, canonicalGuest.position);
});

test("a commander sees their persisted AI controls while rival control modes stay hidden", () => {
  const state = createMultiplayerMatchState("ABC234");
  const guest = state.ships.find((ship) => ship.id === "multiplayer-guest-archer")!;
  guest.controller = "ai";
  guest.aiDoctrine = "defensive";
  guest.aiMission = "bombing";

  const guestView = stateForMultiplayerPerspective(state, "guest");
  const hostView = stateForMultiplayerPerspective(state, "host");
  const guestOwnArcher = guestView.ships.find((ship) => ship.id === guest.id)!;
  const hostRivalArcher = hostView.ships.find((ship) => ship.id === guest.id)!;

  assert.equal(guestOwnArcher.team, "player");
  assert.equal(guestOwnArcher.controller, "ai");
  assert.equal(guestOwnArcher.aiDoctrine, "defensive");
  assert.equal(guestOwnArcher.aiMission, "bombing");
  assert.equal(hostRivalArcher.team, "enemy");
  assert.equal(hostRivalArcher.controller, "ai");
});

test("server accepts only a complete order envelope for the authenticated side", () => {
  const state = createMultiplayerMatchState("ABC234");
  const hostOrders = completeOrders(state, "host");

  assert.deepEqual(validateMultiplayerOrders(state, "host", hostOrders), hostOrders);
  assert.throws(() => validateMultiplayerOrders(state, "host", {}), /Missing orders/);
  assert.throws(() => validateMultiplayerOrders(state, "guest", hostOrders), /outside this fleet/);
});

test("server accepts and applies only the authenticated fleet's control settings", () => {
  const state = createMultiplayerMatchState("ABC234");
  const controls = multiplayerControlsForSide(state, "host");
  controls["multiplayer-host-archer"] = {
    controller: "ai",
    aiDoctrine: "defensive",
    aiMission: "bombing",
  };

  const validated = validateMultiplayerControls(state, "host", controls);
  const controlled = applyMultiplayerControls(state, validated);
  const archer = controlled.ships.find((ship) => ship.id === "multiplayer-host-archer")!;

  assert.equal(archer.controller, "ai");
  assert.equal(archer.aiDoctrine, "defensive");
  assert.equal(archer.aiMission, "bombing");
  assert.throws(() => validateMultiplayerControls(state, "guest", controls), /outside this fleet/);
});

test("turn deadlines escalate after a timeout and concessions award the rival", () => {
  assert.equal(multiplayerTurnDuration(false), MULTIPLAYER_TURN_MS);
  assert.equal(multiplayerTurnDuration(true), MULTIPLAYER_TIMEOUT_TURN_MS);
  assert.equal(MULTIPLAYER_TURN_MS, 120_000);
  assert.equal(MULTIPLAYER_TIMEOUT_TURN_MS, 30_000);
  assert.equal(multiplayerWinnerAfterConcession("host"), "guest");
  assert.equal(multiplayerWinnerAfterConcession("guest"), "host");
});

test("an expired commander receives a complete legal AI order envelope", () => {
  const state = createMultiplayerMatchState("ABC234");
  const hostOrders = multiplayerTimeoutOrders(state, "host");
  const guestOrders = multiplayerTimeoutOrders(state, "guest");

  assert.equal(Object.keys(hostOrders).length, 5);
  assert.equal(Object.keys(guestOrders).length, 5);
  assert.doesNotThrow(() => validateMultiplayerOrders(state, "host", hostOrders));
  assert.doesNotThrow(() => validateMultiplayerOrders(state, "guest", guestOrders));
});

test("server resolves both hidden submissions together and alternates activation priority", () => {
  const state = createMultiplayerMatchState("ABC234");
  const hostOrders = completeOrders(state, "host");
  const guestOrders = completeOrders(state, "guest");
  const source = JSON.stringify({ state, hostOrders, guestOrders });

  const result = resolveMultiplayerTurn(state, hostOrders, guestOrders);

  assert.equal(JSON.stringify({ state, hostOrders, guestOrders }), source);
  assert.equal(result.resolution.turn, 1);
  assert.equal(result.nextState.turn, 2);
  assert.equal(result.nextState.mode, "multiplayer");
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(result))), JSON.stringify(result));
  assert.ok(result.resolution.orders["multiplayer-host-hammerhead"]);
  assert.ok(result.resolution.orders["multiplayer-guest-hammerhead"]);
});

test("AI control choices survive multiplayer turn resolution", () => {
  const state = createMultiplayerMatchState("ABC234");
  const hostControls = multiplayerControlsForSide(state, "host");
  const guestControls = multiplayerControlsForSide(state, "guest");
  hostControls["multiplayer-host-hulk"] = {
    controller: "ai",
    aiDoctrine: "aggressive",
    aiMission: "assault",
  };
  const controlled = applyMultiplayerControls(state, { ...hostControls, ...guestControls });

  const result = resolveMultiplayerTurn(
    controlled,
    completeOrders(controlled, "host"),
    completeOrders(controlled, "guest"),
  );
  const hulk = result.nextState.ships.find((ship) => ship.id === "multiplayer-host-hulk")!;

  assert.equal(hulk.controller, "ai");
  assert.equal(hulk.aiDoctrine, "aggressive");
  assert.equal(hulk.aiMission, "assault");
});

test("mutual fleet destruction is reported as a draw", () => {
  const state = createMultiplayerMatchState("ABC234");
  state.ships = state.ships.map((ship) => ({ ...ship, hull: 0 }));

  const result = resolveMultiplayerTurn(state, {}, {});

  assert.equal(result.winner, "draw");
  assert.equal(result.nextState.phase, "draw");
});
