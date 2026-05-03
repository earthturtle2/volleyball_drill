import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { TacticDocumentV1 } from "@volleyball/shared";

export type TeamPlayer = {
  id: string;
  name: string;
  number: number;
};

export type MatchPrepEntry = {
  id: string;
  playId: string;
  code: string;
  category: string;
  cue?: string;
  notes?: string;
  sortOrder: number;
};

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  /** 公开头像：http(s) 或受控体积的 data URL */
  avatarUrl: text("avatar_url"),
  /** 个人简介，展示用 */
  bio: text("bio"),
  role: text("role").notNull().default("coach"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_refresh_user").on(t.userId)],
);

export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usedBy: text("used_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("idx_invite_codes_created_by").on(t.createdBy)],
);

export const teams = sqliteTable(
  "teams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#e53935"),
    players: text("players", { mode: "json" })
      .$type<TeamPlayer[]>()
      .notNull()
      .$defaultFn(() => []),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_teams_user").on(t.userId)],
);

export const plays = sqliteTable(
  "plays",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    teamIds: text("team_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default(""),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    document: text("document", { mode: "json" }).$type<TacticDocumentV1>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    /** 模版库对教练的可见性：`all_coaches` 全部教练可见；`partial` 指定账户可见；`hidden` 不在共享库列出（仅作者保留） */
    libraryScope: text("library_scope").notNull().default("all_coaches"),
    sharedWithUserIds: text("shared_with_user_ids", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
  },
  (t) => [index("idx_plays_user").on(t.userId), index("idx_plays_user_updated").on(t.userId, t.updatedAt)],
);

export const tacticCategories = sqliteTable(
  "tactic_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_tactic_categories_user").on(t.userId),
    uniqueIndex("uniq_tactic_categories_user_name").on(t.userId, t.name),
  ],
);

export const playShares = sqliteTable(
  "play_shares",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    playId: text("play_id")
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_shares_play").on(t.playId)],
);

export const matchPreparations = sqliteTable(
  "match_preparations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    opponent: text("opponent"),
    gameDate: integer("game_date", { mode: "timestamp_ms" }),
    notes: text("notes"),
    entries: text("entries", { mode: "json" })
      .$type<MatchPrepEntry[]>()
      .notNull()
      .$defaultFn(() => []),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_match_preps_user").on(t.userId),
    index("idx_match_preps_user_updated").on(t.userId, t.updatedAt),
  ],
);

export const matchPrepShares = sqliteTable(
  "match_prep_shares",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    prepId: text("prep_id")
      .notNull()
      .references(() => matchPreparations.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_match_prep_shares_prep").on(t.prepId)],
);

export type UserRow = typeof users.$inferSelect;
export type InviteCodeRow = typeof inviteCodes.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type PlayRow = typeof plays.$inferSelect;
export type TacticCategoryRow = typeof tacticCategories.$inferSelect;
export type PlayShareRow = typeof playShares.$inferSelect;
export type MatchPreparationRow = typeof matchPreparations.$inferSelect;
export type MatchPrepShareRow = typeof matchPrepShares.$inferSelect;
