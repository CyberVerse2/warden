import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  createdAt: timestamp("created_at"),
});

export const magicLinks = sqliteTable(
  "magic_links",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    hashIdx: uniqueIndex("magic_links_hash_idx").on(t.tokenHash),
    emailIdx: index("magic_links_email_idx").on(t.email),
  }),
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: timestamp("created_at"),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at"),
  },
  (t) => ({ userIdx: index("agents_user_idx").on(t.userId) }),
);

export const agentTokens = sqliteTable(
  "agent_tokens",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    hashIdx: uniqueIndex("agent_tokens_hash_idx").on(t.tokenHash),
    agentIdx: index("agent_tokens_agent_idx").on(t.agentId),
  }),
);

export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    network: text("network", { enum: ["solana-mainnet", "solana-devnet"] })
      .notNull(),
    publicKey: text("public_key").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    agentIdx: index("wallets_agent_idx").on(t.agentId),
    pubkeyIdx: uniqueIndex("wallets_pubkey_idx").on(t.publicKey),
  }),
);

export const policies = sqliteTable(
  "policies",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: text("config", { mode: "json" }).notNull(),
    activatedAt: integer("activated_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    agentIdx: index("policies_agent_idx").on(t.agentId),
    agentVersionIdx: uniqueIndex("policies_agent_version_idx").on(
      t.agentId,
      t.version,
    ),
  }),
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    walletId: text("wallet_id").references(() => wallets.id),
    policyId: text("policy_id").references(() => policies.id),
    provider: text("provider"),
    url: text("url").notNull(),
    method: text("method").notNull(),
    host: text("host").notNull(),
    amountRaw: text("amount_raw"),
    amountUsd: real("amount_usd"),
    currency: text("currency"),
    network: text("network"),
    recipient: text("recipient"),
    challengeHash: text("challenge_hash"),
    requestHash: text("request_hash"),
    responseStatus: integer("response_status"),
    txSignature: text("tx_signature"),
    decision: text("decision", {
      enum: ["allow", "deny", "failed"],
    }).notNull(),
    decisionReason: text("decision_reason"),
    taskId: text("task_id"),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    agentIdx: index("receipts_agent_idx").on(t.agentId),
    createdIdx: index("receipts_created_idx").on(t.createdAt),
    decisionIdx: index("receipts_decision_idx").on(t.decision),
  }),
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    requestSnapshot: text("request_snapshot", { mode: "json" }).notNull(),
    triggeringRule: text("triggering_rule").notNull(),
    amountUsd: real("amount_usd").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "denied", "expired"],
    })
      .notNull()
      .default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (t) => ({
    agentIdx: index("approvals_agent_idx").on(t.agentId),
    statusIdx: index("approvals_status_idx").on(t.status),
  }),
);

export const spendWindows = sqliteTable(
  "spend_windows",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    windowKey: text("window_key").notNull(),
    amountUsd: real("amount_usd").notNull().default(0),
    updatedAt: timestamp("updated_at"),
  },
  (t) => ({
    pk: uniqueIndex("spend_windows_pk").on(t.agentId, t.windowKey),
  }),
);
