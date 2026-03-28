-- Migration: Add crypto predictor tables
-- prediction_windows, pattern_settings, ml_model_state, scheduler_config, prediction_revisions

CREATE TABLE IF NOT EXISTS `prediction_windows` (
  `id` int AUTO_INCREMENT NOT NULL,
  `windowStart` bigint NOT NULL,
  `windowEnd` bigint NOT NULL,
  `prediction` enum('UP','DOWN','NEUTRAL'),
  `predictionConfidence` float DEFAULT 0,
  `predictionMadeAt` bigint,
  `actualResult` enum('UP','DOWN'),
  `predictionCorrect` boolean,
  `openPrice` float DEFAULT 0,
  `closePrice` float,
  `priceChangePct` float,
  `highPrice` float DEFAULT 0,
  `lowPrice` float DEFAULT 0,
  `totalVolume` float DEFAULT 0,
  `analysisFactors` json,
  `aiPrediction` enum('UP','DOWN','SKIP'),
  `aiConfidence` float,
  `aiRiskLevel` enum('LOW','MEDIUM','HIGH'),
  `aiReasoning` text,
  `source` varchar(32) DEFAULT 'browser',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `prediction_windows_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `pattern_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patternKey` varchar(64) NOT NULL,
  `patternName` varchar(128) NOT NULL,
  `description` text,
  `enabled` boolean NOT NULL DEFAULT true,
  `weight` float NOT NULL DEFAULT 1.0,
  `totalPredictions` int NOT NULL DEFAULT 0,
  `correctPredictions` int NOT NULL DEFAULT 0,
  `successRate` float DEFAULT 0,
  `mlWeight` float DEFAULT 1.0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pattern_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `pattern_settings_patternKey_unique` UNIQUE(`patternKey`)
);

CREATE TABLE IF NOT EXISTS `ml_model_state` (
  `id` int AUTO_INCREMENT NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `weights` json,
  `trainingRounds` int NOT NULL DEFAULT 0,
  `totalSamples` int NOT NULL DEFAULT 0,
  `lastTrainingAccuracy` float,
  `bestAccuracy` float,
  `learningRate` float DEFAULT 0.01,
  `status` enum('idle','training','ready') NOT NULL DEFAULT 'idle',
  `lastTrainedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ml_model_state_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `scheduler_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `intervalMinutes` int NOT NULL DEFAULT 5,
  `lastRunAt` timestamp,
  `lastRunStatus` varchar(32),
  `lastRunError` text,
  `totalRuns` int NOT NULL DEFAULT 0,
  `consecutiveErrors` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `scheduler_config_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `prediction_revisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `windowId` int NOT NULL,
  `windowStart` bigint NOT NULL,
  `revisionNumber` int NOT NULL DEFAULT 1,
  `previousPrediction` enum('UP','DOWN','NEUTRAL'),
  `newPrediction` enum('UP','DOWN','NEUTRAL') NOT NULL,
  `previousConfidence` float,
  `newConfidence` float NOT NULL,
  `reason` text,
  `minuteIntoWindow` float,
  `analysisFactors` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `prediction_revisions_id` PRIMARY KEY(`id`)
);
