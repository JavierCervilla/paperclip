import { pgTable, uuid, text, integer, timestamp, index, foreignKey } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    startedByUserId: text("started_by_user_id").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"), // "idle_timeout" | "user_closed" | "agent_closed" | null
    /** AI-generated short summary of the conversation, written when the session ends. */
    summary: text("summary"),
    /** When this session was started by resuming an earlier one, points at that prior session. */
    resumedFromSessionId: uuid("resumed_from_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentStartedIdx: index("chat_sessions_agent_started_idx").on(table.agentId, table.startedAt),
    companyAgentIdx: index("chat_sessions_company_agent_idx").on(table.companyId, table.agentId),
    resumedFromIdx: index("chat_sessions_resumed_from_idx").on(table.resumedFromSessionId),
    resumedFromFk: foreignKey({
      columns: [table.resumedFromSessionId],
      foreignColumns: [table.id],
      name: "chat_sessions_resumed_from_session_id_fk",
    }),
  }),
);
