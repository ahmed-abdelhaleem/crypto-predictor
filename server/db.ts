import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Run CREATE TABLE IF NOT EXISTS migrations for all new tables.
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
export async function runMigrations(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot run migrations: database not available");
    return;
  }

  console.log("[Database] Running migrations...");

  const migrations = [
    `CREATE TABLE IF NOT EXISTS \`prediction_windows\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`windowStart\` bigint NOT NULL,
      \`windowEnd\` bigint NOT NULL,
      \`prediction\` enum('UP','DOWN','NEUTRAL'),
      \`predictionConfidence\` float DEFAULT 0,
      \`predictionMadeAt\` bigint,
      \`actualResult\` enum('UP','DOWN'),
      \`predictionCorrect\` boolean,
      \`openPrice\` float DEFAULT 0,
      \`closePrice\` float,
      \`priceChangePct\` float,
      \`highPrice\` float DEFAULT 0,
      \`lowPrice\` float DEFAULT 0,
      \`totalVolume\` float DEFAULT 0,
      \`analysisFactors\` json,
      \`aiPrediction\` enum('UP','DOWN','SKIP'),
      \`aiConfidence\` float,
      \`aiRiskLevel\` enum('LOW','MEDIUM','HIGH'),
      \`aiReasoning\` text,
      \`source\` varchar(32) DEFAULT 'browser',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`prediction_windows_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`pattern_settings\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`patternKey\` varchar(64) NOT NULL,
      \`patternName\` varchar(128) NOT NULL,
      \`description\` text,
      \`enabled\` boolean NOT NULL DEFAULT true,
      \`weight\` float NOT NULL DEFAULT 1.0,
      \`totalPredictions\` int NOT NULL DEFAULT 0,
      \`correctPredictions\` int NOT NULL DEFAULT 0,
      \`successRate\` float DEFAULT 0,
      \`mlWeight\` float DEFAULT 1.0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`pattern_settings_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`pattern_settings_patternKey_unique\` UNIQUE(\`patternKey\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`ml_model_state\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`weights\` json,
      \`trainingRounds\` int NOT NULL DEFAULT 0,
      \`totalSamples\` int NOT NULL DEFAULT 0,
      \`lastTrainingAccuracy\` float,
      \`bestAccuracy\` float,
      \`learningRate\` float DEFAULT 0.01,
      \`status\` enum('idle','training','ready') NOT NULL DEFAULT 'idle',
      \`lastTrainedAt\` timestamp,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`ml_model_state_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`scheduler_config\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`enabled\` boolean NOT NULL DEFAULT true,
      \`intervalMinutes\` int NOT NULL DEFAULT 5,
      \`lastRunAt\` timestamp,
      \`lastRunStatus\` varchar(32),
      \`totalRuns\` int NOT NULL DEFAULT 0,
      \`consecutiveErrors\` int NOT NULL DEFAULT 0,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`scheduler_config_id\` PRIMARY KEY(\`id\`)
    )`,
    `CREATE TABLE IF NOT EXISTS \`prediction_revisions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`windowId\` int NOT NULL,
      \`windowStart\` bigint NOT NULL,
      \`revisionNumber\` int NOT NULL DEFAULT 1,
      \`previousPrediction\` enum('UP','DOWN','NEUTRAL'),
      \`newPrediction\` enum('UP','DOWN','NEUTRAL') NOT NULL,
      \`previousConfidence\` float,
      \`newConfidence\` float NOT NULL,
      \`reason\` text,
      \`minuteIntoWindow\` float,
      \`analysisFactors\` json,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`prediction_revisions_id\` PRIMARY KEY(\`id\`)
    )`,
  ];

  for (const migration of migrations) {
    try {
      await db.execute(sql.raw(migration));
    } catch (err) {
      console.error("[Database] Migration error:", err);
    }
  }

  console.log("[Database] Migrations complete");
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}
