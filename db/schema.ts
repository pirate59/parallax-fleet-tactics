import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const multiplayerMatches = sqliteTable("multiplayer_matches", {
  code: text("code").primaryKey(),
  status: text("status").notNull(),
  turn: integer("turn").notNull(),
  stateJson: text("state_json").notNull(),
  resolutionJson: text("resolution_json"),
  hostTokenHash: text("host_token_hash").notNull(),
  guestTokenHash: text("guest_token_hash"),
  hostName: text("host_name").notNull(),
  guestName: text("guest_name"),
  hostSubmittedTurn: integer("host_submitted_turn"),
  guestSubmittedTurn: integer("guest_submitted_turn"),
  hostLastSeenAt: integer("host_last_seen_at"),
  guestLastSeenAt: integer("guest_last_seen_at"),
  winner: text("winner"),
  deadlineAt: integer("deadline_at"),
  lastTurnTimedOut: integer("last_turn_timed_out").notNull().default(0),
  completionReason: text("completion_reason"),
  concededBy: text("conceded_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("idx_multiplayer_matches_status_updated").on(table.status, table.updatedAt)]);

export const multiplayerOrders = sqliteTable("multiplayer_orders", {
  matchCode: text("match_code").notNull().references(() => multiplayerMatches.code, { onDelete: "cascade" }),
  turn: integer("turn").notNull(),
  side: text("side").notNull(),
  ordersJson: text("orders_json").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.matchCode, table.turn, table.side] })]);
