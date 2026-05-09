import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

const dateTime = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  createdAt: createdAt("created_at"),
});

export const magicLinks = pgTable(
  "magic_links",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: dateTime("expires_at").notNull(),
    consumedAt: dateTime("consumed_at"),
    createdAt: createdAt("created_at"),
  },
  (t) => [
    uniqueIndex("magic_links_hash_idx").on(t.tokenHash),
    index("magic_links_email_idx").on(t.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: dateTime("expires_at").notNull(),
    createdAt: createdAt("created_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const agents = pgTable(
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
    createdAt: createdAt("created_at"),
  },
  (t) => [index("agents_user_idx").on(t.userId)],
);

export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    lastUsedAt: dateTime("last_used_at"),
    revokedAt: dateTime("revoked_at"),
    createdAt: createdAt("created_at"),
  },
  (t) => [
    uniqueIndex("agent_tokens_hash_idx").on(t.tokenHash),
    index("agent_tokens_agent_idx").on(t.agentId),
  ],
);

export const wallets = pgTable(
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
    createdAt: createdAt("created_at"),
  },
  (t) => [
    index("wallets_agent_idx").on(t.agentId),
    uniqueIndex("wallets_pubkey_idx").on(t.publicKey),
  ],
);

export const policies = pgTable(
  "policies",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    config: jsonb("config").notNull(),
    activatedAt: dateTime("activated_at"),
    createdAt: createdAt("created_at"),
  },
  (t) => [
    index("policies_agent_idx").on(t.agentId),
    uniqueIndex("policies_agent_version_idx").on(t.agentId, t.version),
  ],
);

export const receipts = pgTable(
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
    amountUsd: doublePrecision("amount_usd"),
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
    createdAt: createdAt("created_at"),
  },
  (t) => [
    index("receipts_agent_idx").on(t.agentId),
    index("receipts_created_idx").on(t.createdAt),
    index("receipts_decision_idx").on(t.decision),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    requestSnapshot: jsonb("request_snapshot").notNull(),
    triggeringRule: text("triggering_rule").notNull(),
    amountUsd: doublePrecision("amount_usd").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "denied", "expired"],
    })
      .notNull()
      .default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: dateTime("decided_at"),
    expiresAt: dateTime("expires_at"),
    createdAt: createdAt("created_at"),
  },
  (t) => [
    index("approvals_agent_idx").on(t.agentId),
    index("approvals_status_idx").on(t.status),
  ],
);

export const spendWindows = pgTable(
  "spend_windows",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    windowKey: text("window_key").notNull(),
    amountUsd: doublePrecision("amount_usd").notNull().default(0),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.windowKey] })],
);
