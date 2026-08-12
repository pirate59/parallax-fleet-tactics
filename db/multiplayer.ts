import { env } from "cloudflare:workers";
import {
  applyMultiplayerControls,
  createMultiplayerMatchState,
  MULTIPLAYER_TURN_MS,
  multiplayerControlsForSide,
  multiplayerTimeoutOrders,
  multiplayerTurnDuration,
  multiplayerWinnerAfterConcession,
  resolutionForMultiplayerPerspective,
  resolveMultiplayerTurn,
  stateForMultiplayerPerspective,
  validateMultiplayerControls,
  validateMultiplayerOrders,
  type MultiplayerControlSettings,
  type MultiplayerCompletionReason,
  type MultiplayerMatchStatus,
  type MultiplayerSession,
  type MultiplayerSide,
  type MultiplayerView,
  type MultiplayerWinner,
} from "../app/multiplayerMode.ts";
import type { MatchState, TurnOrders, TurnResolution } from "../app/gameTypes.ts";

type MatchRow = {
  code: string;
  status: MultiplayerMatchStatus;
  turn: number;
  state_json: string;
  resolution_json: string | null;
  host_token_hash: string;
  guest_token_hash: string | null;
  host_name: string;
  guest_name: string | null;
  host_submitted_turn: number | null;
  guest_submitted_turn: number | null;
  winner: MultiplayerWinner;
  deadline_at: number | null;
  last_turn_timed_out: number;
  completion_reason: MultiplayerCompletionReason;
  conceded_by: MultiplayerSide | null;
  created_at: number;
  updated_at: number;
};

type StoredOrderEnvelope = {
  orders: TurnOrders;
  controls: MultiplayerControlSettings;
};

const MATCH_TABLE_SQL = `CREATE TABLE IF NOT EXISTS multiplayer_matches (
  code TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  turn INTEGER NOT NULL,
  state_json TEXT NOT NULL,
  resolution_json TEXT,
  host_token_hash TEXT NOT NULL,
  guest_token_hash TEXT,
  host_name TEXT NOT NULL,
  guest_name TEXT,
  host_submitted_turn INTEGER,
  guest_submitted_turn INTEGER,
  winner TEXT,
  deadline_at INTEGER,
  last_turn_timed_out INTEGER NOT NULL DEFAULT 0,
  completion_reason TEXT,
  conceded_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const ORDER_TABLE_SQL = `CREATE TABLE IF NOT EXISTS multiplayer_orders (
  match_code TEXT NOT NULL,
  turn INTEGER NOT NULL,
  side TEXT NOT NULL,
  orders_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_code, turn, side),
  FOREIGN KEY (match_code) REFERENCES multiplayer_matches(code) ON DELETE CASCADE
)`;

const UPDATED_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_status_updated
ON multiplayer_matches(status, updated_at)`;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_ATTEMPTS = 8;

function database() {
  if (!env.DB) throw new Error("Multiplayer storage is unavailable.");
  return env.DB;
}

let multiplayerSchemaReady: Promise<void> | null = null;

export async function ensureMultiplayerSchema() {
  if (!multiplayerSchemaReady) {
    multiplayerSchemaReady = (async () => {
      const db = database();
      await db.batch([
        db.prepare(MATCH_TABLE_SQL),
        db.prepare(ORDER_TABLE_SQL),
        db.prepare(UPDATED_INDEX_SQL),
      ]);
      const tableInfo = await db.prepare("PRAGMA table_info(multiplayer_matches)").all<{ name: string }>();
      const columns = new Set(tableInfo.results.map((column) => column.name));
      const additions = [
        ["deadline_at", "ALTER TABLE multiplayer_matches ADD COLUMN deadline_at INTEGER"],
        ["last_turn_timed_out", "ALTER TABLE multiplayer_matches ADD COLUMN last_turn_timed_out INTEGER NOT NULL DEFAULT 0"],
        ["completion_reason", "ALTER TABLE multiplayer_matches ADD COLUMN completion_reason TEXT"],
        ["conceded_by", "ALTER TABLE multiplayer_matches ADD COLUMN conceded_by TEXT"],
      ] as const;
      const missing = additions
        .filter(([name]) => !columns.has(name))
        .map(([, sql]) => db.prepare(sql));
      if (missing.length) await db.batch(missing);
    })();
  }
  try {
    await multiplayerSchemaReady;
  } catch (error) {
    multiplayerSchemaReady = null;
    throw error;
  }
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeMatchCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

export function normalizePlayerName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 24);
  return normalized || fallback;
}

async function matchRow(code: string): Promise<MatchRow | null> {
  return database().prepare("SELECT * FROM multiplayer_matches WHERE code = ?")
    .bind(code)
    .first<MatchRow>();
}

function parseState(row: MatchRow): MatchState {
  return JSON.parse(row.state_json) as MatchState;
}

function parseResolution(row: MatchRow): TurnResolution | null {
  return row.resolution_json ? JSON.parse(row.resolution_json) as TurnResolution : null;
}

async function authenticate(row: MatchRow, token: string): Promise<MultiplayerSide> {
  if (!token || token.length > 128) throw new Error("This device is not authorized for the match.");
  const hash = await tokenHash(token);
  if (hash === row.host_token_hash) return "host";
  if (row.guest_token_hash && hash === row.guest_token_hash) return "guest";
  throw new Error("This device is not authorized for the match.");
}

function viewFromRow(row: MatchRow, side: MultiplayerSide): MultiplayerView {
  const ownSubmitted = side === "host" ? row.host_submitted_turn === row.turn : row.guest_submitted_turn === row.turn;
  const opponentSubmitted = side === "host" ? row.guest_submitted_turn === row.turn : row.host_submitted_turn === row.turn;
  const canonicalState = parseState(row);
  const state = stateForMultiplayerPerspective(canonicalState, side);
  if (row.status === "complete" && row.winner) {
    state.phase = row.winner === "draw" ? "draw" : row.winner === side ? "victory" : "defeat";
  }
  return {
    code: row.code,
    side,
    status: row.status,
    turn: row.turn,
    hostName: row.host_name,
    guestName: row.guest_name,
    opponentJoined: Boolean(row.guest_token_hash),
    ownSubmitted,
    opponentSubmitted,
    winner: row.winner,
    deadlineAt: row.deadline_at,
    lastTurnTimedOut: Boolean(row.last_turn_timed_out),
    completionReason: row.completion_reason,
    concededBy: row.conceded_by,
    state,
    lastResolution: resolutionForMultiplayerPerspective(parseResolution(row), side),
  };
}

export async function createMultiplayerMatch(name: unknown): Promise<{ session: MultiplayerSession; view: MultiplayerView }> {
  await ensureMultiplayerSchema();
  const db = database();
  const token = randomToken();
  const hash = await tokenHash(token);
  const hostName = normalizePlayerName(name, "Azure Commander");
  const now = Date.now();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    const state = createMultiplayerMatchState(code);
    const result = await db.prepare(`INSERT OR IGNORE INTO multiplayer_matches (
      code, status, turn, state_json, resolution_json, host_token_hash, guest_token_hash,
      host_name, guest_name, host_submitted_turn, guest_submitted_turn, winner, created_at, updated_at
    ) VALUES (?, 'waiting', 1, ?, NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, ?, ?)`)
      .bind(code, JSON.stringify(state), hash, hostName, now, now)
      .run();
    if ((result.meta.changes ?? 0) > 0) {
      const row = await matchRow(code);
      if (!row) throw new Error("The match could not be created.");
      return { session: { code, token, side: "host" }, view: viewFromRow(row, "host") };
    }
  }
  throw new Error("A unique match code could not be allocated. Try again.");
}

export async function joinMultiplayerMatch(codeInput: string, name: unknown): Promise<{ session: MultiplayerSession; view: MultiplayerView }> {
  await ensureMultiplayerSchema();
  const code = normalizeMatchCode(codeInput);
  if (code.length !== 6) throw new Error("Enter the complete six-character match code.");
  const token = randomToken();
  const hash = await tokenHash(token);
  const guestName = normalizePlayerName(name, "Crimson Commander");
  const now = Date.now();
  const result = await database().prepare(`UPDATE multiplayer_matches
    SET guest_token_hash = ?, guest_name = ?, status = 'planning', deadline_at = ?,
      last_turn_timed_out = 0, completion_reason = NULL, conceded_by = NULL, updated_at = ?
    WHERE code = ? AND status = 'waiting' AND guest_token_hash IS NULL`)
    .bind(hash, guestName, now + MULTIPLAYER_TURN_MS, now, code)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    const existing = await matchRow(code);
    if (!existing) throw new Error("No match was found for that code.");
    throw new Error("That match already has two commanders or is no longer joinable.");
  }
  const row = await matchRow(code);
  if (!row) throw new Error("The match could not be joined.");
  return { session: { code, token, side: "guest" }, view: viewFromRow(row, "guest") };
}

export async function readMultiplayerMatch(codeInput: string, token: string): Promise<MultiplayerView> {
  await ensureMultiplayerSchema();
  const code = normalizeMatchCode(codeInput);
  let row = await matchRow(code);
  if (!row) throw new Error("That multiplayer match no longer exists.");
  const side = await authenticate(row, token);
  row = await advanceExpiredMatch(row);
  return viewFromRow(row, side);
}

function storedEnvelope(value: string, state: MatchState, side: MultiplayerSide): StoredOrderEnvelope {
  const parsed = JSON.parse(value) as TurnOrders | StoredOrderEnvelope;
  return "orders" in parsed && "controls" in parsed
    ? parsed
    : {
        orders: parsed as TurnOrders,
        controls: multiplayerControlsForSide(state, side),
      };
}

async function resolveClaimedTurn(row: MatchRow, timedOut = false) {
  const db = database();
  const orderRows = await db.prepare(`SELECT side, orders_json FROM multiplayer_orders
    WHERE match_code = ? AND turn = ? ORDER BY side`)
    .bind(row.code, row.turn)
    .all<{ side: MultiplayerSide; orders_json: string }>();
  const currentState = parseState(row);
  const bySide = new Map(orderRows.results.map((entry) => [
    entry.side,
    storedEnvelope(entry.orders_json, currentState, entry.side),
  ]));
  const submittedThisTurn = (side: MultiplayerSide) => side === "host"
    ? row.host_submitted_turn === row.turn
    : row.guest_submitted_turn === row.turn;
  const envelopeFor = (side: MultiplayerSide) => submittedThisTurn(side)
    ? bySide.get(side)
    : timedOut
      ? {
          orders: multiplayerTimeoutOrders(currentState, side),
          controls: multiplayerControlsForSide(currentState, side),
        }
      : undefined;
  const hostEnvelope = envelopeFor("host");
  const guestEnvelope = envelopeFor("guest");
  if (!hostEnvelope || !guestEnvelope) {
    await db.prepare("UPDATE multiplayer_matches SET status = 'planning', updated_at = ? WHERE code = ? AND turn = ?")
      .bind(Date.now(), row.code, row.turn)
      .run();
    return;
  }

  const controlledState = applyMultiplayerControls(currentState, {
    ...hostEnvelope.controls,
    ...guestEnvelope.controls,
  });
  const resolved = resolveMultiplayerTurn(controlledState, hostEnvelope.orders, guestEnvelope.orders);
  const nextStatus: MultiplayerMatchStatus = resolved.winner ? "complete" : "planning";
  const now = Date.now();
  const nextDeadline = resolved.winner
    ? null
    : now + multiplayerTurnDuration(timedOut);
  await db.prepare(`UPDATE multiplayer_matches SET
    status = ?, turn = ?, state_json = ?, resolution_json = ?, winner = ?,
    host_submitted_turn = NULL, guest_submitted_turn = NULL, deadline_at = ?,
    last_turn_timed_out = ?, completion_reason = ?, conceded_by = NULL, updated_at = ?
    WHERE code = ? AND turn = ? AND status = 'resolving'`)
    .bind(
      nextStatus,
      resolved.nextState.turn,
      JSON.stringify(resolved.nextState),
      JSON.stringify(resolved.resolution),
      resolved.winner,
      nextDeadline,
      timedOut ? 1 : 0,
      resolved.winner ? "combat" : null,
      now,
      row.code,
      row.turn,
    )
    .run();
}

async function advanceExpiredMatch(source: MatchRow): Promise<MatchRow> {
  let row = source;
  if (row.status === "planning" && row.deadline_at === null) {
    const deadline = Date.now() + MULTIPLAYER_TURN_MS;
    await database().prepare(`UPDATE multiplayer_matches SET deadline_at = ?, updated_at = ?
      WHERE code = ? AND turn = ? AND status = 'planning' AND deadline_at IS NULL`)
      .bind(deadline, Date.now(), row.code, row.turn)
      .run();
    row = await matchRow(row.code) ?? row;
  }
  if (row.status !== "planning" || row.deadline_at === null || row.deadline_at > Date.now()) return row;
  const claim = await database().prepare(`UPDATE multiplayer_matches SET status = 'resolving', updated_at = ?
    WHERE code = ? AND turn = ? AND status = 'planning' AND deadline_at <= ?`)
    .bind(Date.now(), row.code, row.turn, Date.now())
    .run();
  if ((claim.meta.changes ?? 0) > 0) {
    await resolveClaimedTurn({ ...row, status: "resolving" }, true);
  }
  return await matchRow(row.code) ?? row;
}

export async function submitMultiplayerOrders(
  codeInput: string,
  token: string,
  turn: unknown,
  submitted: unknown,
  submittedControls?: unknown,
): Promise<MultiplayerView> {
  await ensureMultiplayerSchema();
  const code = normalizeMatchCode(codeInput);
  let row = await matchRow(code);
  if (!row) throw new Error("That multiplayer match no longer exists.");
  const side = await authenticate(row, token);
  row = await advanceExpiredMatch(row);
  if (row.status === "waiting") throw new Error("The second commander has not joined yet.");
  if (row.status === "complete") return viewFromRow(row, side);
  if (row.status !== "planning" || turn !== row.turn) throw new Error("The match has already advanced beyond those orders.");
  const state = parseState(row);
  const orders = validateMultiplayerOrders(state, side, submitted);
  const controls = validateMultiplayerControls(state, side, submittedControls);
  const submittedColumn = side === "host" ? "host_submitted_turn" : "guest_submitted_turn";
  const now = Date.now();
  const batchResults = await database().batch([
    database().prepare(`INSERT INTO multiplayer_orders (match_code, turn, side, orders_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(match_code, turn, side) DO UPDATE SET orders_json = excluded.orders_json, created_at = excluded.created_at`)
      .bind(code, row.turn, side, JSON.stringify({ orders, controls } satisfies StoredOrderEnvelope), now),
    database().prepare(`UPDATE multiplayer_matches SET ${submittedColumn} = ?, updated_at = ?
      WHERE code = ? AND turn = ? AND status = 'planning' AND (deadline_at IS NULL OR deadline_at > ?)`)
      .bind(row.turn, now, code, row.turn, now),
  ]);
  if ((batchResults[1]?.meta.changes ?? 0) === 0) {
    const advanced = await matchRow(code);
    if (advanced) await advanceExpiredMatch(advanced);
    throw new Error("The turn deadline passed before those orders arrived.");
  }

  const ready = await matchRow(code);
  if (!ready) throw new Error("The match became unavailable.");
  if (ready.host_submitted_turn === ready.turn && ready.guest_submitted_turn === ready.turn) {
    const claim = await database().prepare(`UPDATE multiplayer_matches SET status = 'resolving', updated_at = ?
      WHERE code = ? AND turn = ? AND status = 'planning'`)
      .bind(Date.now(), code, ready.turn)
      .run();
    if ((claim.meta.changes ?? 0) > 0) {
      await resolveClaimedTurn({ ...ready, status: "resolving" });
    }
  }

  const updated = await matchRow(code);
  if (!updated) throw new Error("The match became unavailable.");
  return viewFromRow(updated, side);
}

export async function concedeMultiplayerMatch(codeInput: string, token: string): Promise<MultiplayerView> {
  await ensureMultiplayerSchema();
  const code = normalizeMatchCode(codeInput);
  const row = await matchRow(code);
  if (!row) throw new Error("That multiplayer match no longer exists.");
  const side = await authenticate(row, token);
  if (row.status === "waiting") throw new Error("The match has not started yet.");
  if (row.status !== "complete") {
    const winner = multiplayerWinnerAfterConcession(side);
    await database().prepare(`UPDATE multiplayer_matches SET status = 'complete', winner = ?,
      deadline_at = NULL, completion_reason = 'concession', conceded_by = ?, updated_at = ?
      WHERE code = ? AND status != 'complete'`)
      .bind(winner, side, Date.now(), code)
      .run();
  }
  const updated = await matchRow(code);
  if (!updated) throw new Error("The match became unavailable.");
  return viewFromRow(updated, side);
}
