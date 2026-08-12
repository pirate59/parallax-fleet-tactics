import { env } from "cloudflare:workers";
import {
  createMultiplayerMatchState,
  resolutionForMultiplayerPerspective,
  resolveMultiplayerTurn,
  stateForMultiplayerPerspective,
  validateMultiplayerOrders,
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
  created_at: number;
  updated_at: number;
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

export async function ensureMultiplayerSchema() {
  const db = database();
  await db.batch([
    db.prepare(MATCH_TABLE_SQL),
    db.prepare(ORDER_TABLE_SQL),
    db.prepare(UPDATED_INDEX_SQL),
  ]);
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
  const result = await database().prepare(`UPDATE multiplayer_matches
    SET guest_token_hash = ?, guest_name = ?, status = 'planning', updated_at = ?
    WHERE code = ? AND status = 'waiting' AND guest_token_hash IS NULL`)
    .bind(hash, guestName, Date.now(), code)
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
  const row = await matchRow(code);
  if (!row) throw new Error("That multiplayer match no longer exists.");
  const side = await authenticate(row, token);
  return viewFromRow(row, side);
}

async function resolveClaimedTurn(row: MatchRow) {
  const db = database();
  const orderRows = await db.prepare(`SELECT side, orders_json FROM multiplayer_orders
    WHERE match_code = ? AND turn = ? ORDER BY side`)
    .bind(row.code, row.turn)
    .all<{ side: MultiplayerSide; orders_json: string }>();
  const bySide = new Map(orderRows.results.map((entry) => [entry.side, JSON.parse(entry.orders_json) as TurnOrders]));
  const hostOrders = bySide.get("host");
  const guestOrders = bySide.get("guest");
  if (!hostOrders || !guestOrders) {
    await db.prepare("UPDATE multiplayer_matches SET status = 'planning', updated_at = ? WHERE code = ? AND turn = ?")
      .bind(Date.now(), row.code, row.turn)
      .run();
    return;
  }

  const resolved = resolveMultiplayerTurn(parseState(row), hostOrders, guestOrders);
  const nextStatus: MultiplayerMatchStatus = resolved.winner ? "complete" : "planning";
  await db.prepare(`UPDATE multiplayer_matches SET
    status = ?, turn = ?, state_json = ?, resolution_json = ?, winner = ?,
    host_submitted_turn = NULL, guest_submitted_turn = NULL, updated_at = ?
    WHERE code = ? AND turn = ? AND status = 'resolving'`)
    .bind(
      nextStatus,
      resolved.nextState.turn,
      JSON.stringify(resolved.nextState),
      JSON.stringify(resolved.resolution),
      resolved.winner,
      Date.now(),
      row.code,
      row.turn,
    )
    .run();
}

export async function submitMultiplayerOrders(
  codeInput: string,
  token: string,
  turn: unknown,
  submitted: unknown,
): Promise<MultiplayerView> {
  await ensureMultiplayerSchema();
  const code = normalizeMatchCode(codeInput);
  const row = await matchRow(code);
  if (!row) throw new Error("That multiplayer match no longer exists.");
  const side = await authenticate(row, token);
  if (row.status === "waiting") throw new Error("The second commander has not joined yet.");
  if (row.status === "complete") return viewFromRow(row, side);
  if (row.status !== "planning" || turn !== row.turn) throw new Error("The match has already advanced beyond those orders.");
  const orders = validateMultiplayerOrders(parseState(row), side, submitted);
  const submittedColumn = side === "host" ? "host_submitted_turn" : "guest_submitted_turn";
  const now = Date.now();
  await database().batch([
    database().prepare(`INSERT INTO multiplayer_orders (match_code, turn, side, orders_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(match_code, turn, side) DO UPDATE SET orders_json = excluded.orders_json, created_at = excluded.created_at`)
      .bind(code, row.turn, side, JSON.stringify(orders), now),
    database().prepare(`UPDATE multiplayer_matches SET ${submittedColumn} = ?, updated_at = ?
      WHERE code = ? AND turn = ? AND status = 'planning'`)
      .bind(row.turn, now, code, row.turn),
  ]);

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
