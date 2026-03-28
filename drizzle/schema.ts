import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Prediction windows — stores every 5-minute window prediction + outcome
 */
export const predictionWindows = mysqlTable("prediction_windows", {
  id: int("id").autoincrement().primaryKey(),
  windowStart: bigint("windowStart", { mode: "number" }).notNull(),
  windowEnd: bigint("windowEnd", { mode: "number" }).notNull(),
  prediction: mysqlEnum("prediction", ["UP", "DOWN", "NEUTRAL"]),
  predictionConfidence: float("predictionConfidence").default(0),
  predictionMadeAt: bigint("predictionMadeAt", { mode: "number" }),
  actualResult: mysqlEnum("actualResult", ["UP", "DOWN"]),
  predictionCorrect: boolean("predictionCorrect"),
  openPrice: float("openPrice").default(0),
  closePrice: float("closePrice"),
  priceChangePct: float("priceChangePct"),
  highPrice: float("highPrice").default(0),
  lowPrice: float("lowPrice").default(0),
  totalVolume: float("totalVolume").default(0),
  analysisFactors: json("analysisFactors"),
  aiPrediction: mysqlEnum("aiPrediction", ["UP", "DOWN", "SKIP"]),
  aiConfidence: float("aiConfidence"),
  aiRiskLevel: mysqlEnum("aiRiskLevel", ["LOW", "MEDIUM", "HIGH"]),
  aiReasoning: text("aiReasoning"),
  source: varchar("source", { length: 32 }).default("browser"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PredictionWindow = typeof predictionWindows.$inferSelect;
export type InsertPredictionWindow = typeof predictionWindows.$inferInsert;

/**
 * Pattern settings — per-pattern enable/disable with success tracking
 */
export const patternSettings = mysqlTable("pattern_settings", {
  id: int("id").autoincrement().primaryKey(),
  patternKey: varchar("patternKey", { length: 64 }).notNull().unique(),
  patternName: varchar("patternName", { length: 128 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  weight: float("weight").default(1.0).notNull(),
  totalPredictions: int("totalPredictions").default(0).notNull(),
  correctPredictions: int("correctPredictions").default(0).notNull(),
  successRate: float("successRate").default(0),
  mlWeight: float("mlWeight").default(1.0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PatternSetting = typeof patternSettings.$inferSelect;
export type InsertPatternSetting = typeof patternSettings.$inferInsert;

/**
 * ML model state — stores the learned weights and training progress
 */
export const mlModelState = mysqlTable("ml_model_state", {
  id: int("id").autoincrement().primaryKey(),
  version: int("version").default(1).notNull(),
  weights: json("weights"),
  trainingRounds: int("trainingRounds").default(0).notNull(),
  totalSamples: int("totalSamples").default(0).notNull(),
  lastTrainingAccuracy: float("lastTrainingAccuracy"),
  bestAccuracy: float("bestAccuracy"),
  learningRate: float("learningRate").default(0.01),
  status: mysqlEnum("status", ["idle", "training", "ready"]).default("idle").notNull(),
  lastTrainedAt: timestamp("lastTrainedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MlModelState = typeof mlModelState.$inferSelect;
export type InsertMlModelState = typeof mlModelState.$inferInsert;

/**
 * Scheduler config — controls background prediction job
 */
export const schedulerConfig = mysqlTable("scheduler_config", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  intervalMinutes: int("intervalMinutes").default(5).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  lastRunStatus: varchar("lastRunStatus", { length: 32 }),
  totalRuns: int("totalRuns").default(0).notNull(),
  consecutiveErrors: int("consecutiveErrors").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SchedulerConfig = typeof schedulerConfig.$inferSelect;
export type InsertSchedulerConfig = typeof schedulerConfig.$inferInsert;

/**
 * Mid-window prediction revisions — tracks when predictions change during a window
 */
export const predictionRevisions = mysqlTable("prediction_revisions", {
  id: int("id").autoincrement().primaryKey(),
  windowId: int("windowId").notNull(),
  windowStart: bigint("windowStart", { mode: "number" }).notNull(),
  revisionNumber: int("revisionNumber").default(1).notNull(),
  previousPrediction: mysqlEnum("previousPrediction", ["UP", "DOWN", "NEUTRAL"]),
  newPrediction: mysqlEnum("newPrediction", ["UP", "DOWN", "NEUTRAL"]).notNull(),
  previousConfidence: float("previousConfidence"),
  newConfidence: float("newConfidence").notNull(),
  reason: text("reason"),
  minuteIntoWindow: float("minuteIntoWindow"),
  analysisFactors: json("analysisFactors"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PredictionRevision = typeof predictionRevisions.$inferSelect;
export type InsertPredictionRevision = typeof predictionRevisions.$inferInsert;
