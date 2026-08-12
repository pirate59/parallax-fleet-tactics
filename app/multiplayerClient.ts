import type { TurnOrders } from "./gameTypes.ts";
import type { MultiplayerControlSettings, MultiplayerSession, MultiplayerView } from "./multiplayerMode.ts";

const SESSION_KEY = "parallax.multiplayer.session.v1";

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The multiplayer link did not respond.");
  return body;
}

export async function createRemoteMatch(name: string) {
  return jsonRequest<{ session: MultiplayerSession; view: MultiplayerView }>("/api/multiplayer/matches", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinRemoteMatch(code: string, name: string) {
  return jsonRequest<{ session: MultiplayerSession; view: MultiplayerView }>("/api/multiplayer/join", {
    method: "POST",
    body: JSON.stringify({ code, name }),
  });
}

export async function readRemoteMatch(session: MultiplayerSession) {
  return jsonRequest<MultiplayerView>(`/api/multiplayer/matches/${encodeURIComponent(session.code)}`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
}

export async function submitRemoteOrders(
  session: MultiplayerSession,
  turn: number,
  orders: TurnOrders,
  controls: MultiplayerControlSettings,
) {
  return jsonRequest<MultiplayerView>(`/api/multiplayer/matches/${encodeURIComponent(session.code)}/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ turn, orders, controls }),
  });
}

export async function concedeRemoteMatch(session: MultiplayerSession) {
  return jsonRequest<MultiplayerView>(`/api/multiplayer/matches/${encodeURIComponent(session.code)}/concede`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({}),
  });
}

export function saveMultiplayerSession(session: MultiplayerSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadMultiplayerSession(): MultiplayerSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MultiplayerSession>;
    if (typeof parsed.code !== "string" || typeof parsed.token !== "string" || (parsed.side !== "host" && parsed.side !== "guest")) return null;
    return { code: parsed.code, token: parsed.token, side: parsed.side };
  } catch {
    return null;
  }
}

export function clearMultiplayerSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
