/**
 * predictionEngine.ts — Server-side prediction engine
 *
 * Features:
 * 1. Background scheduler — runs every 5 minutes, even when browser is closed
 * 2. Self-learning ML model — adjusts indicator weights based on historical accuracy
 * 3. Pattern enable/disable — respects user-configured pattern settings
 * 4. computePredictionWithWeights — shared prediction logic used by both scheduler and API
 */

import { getDb } from "./db";
import {
  predictionWindows,
  patternSettings,
  mlModelState,
  schedulerConfig,
} from "../drizzle/schema";
import { eq, desc, isNotNull, and, sql } from "drizzle-orm";

// ---- Default pattern definitions ----
export const DEFAULT_PATTERNS = [
  {
    patternKey: "momentum",
    patternName: "Momentum",
    description: "Overall price change from window open to current close",
    weight: 0.25,
  },
  {
    patternKey: "volumeDelta",
    patternName: "Volume Delta",
    description: "Bullish vs bearish candle volume comparison",
    weight: 0.20,
  },
  {
    patternKey: "priceVelocity",
    patternName: "Price Velocity",
    description: "Price acceleration — is momentum speeding up or slowing?",
    weight: 0.15,
  },
  {
    patternKey: "rsiScore",
    patternName: "RSI (3-period)",
    description: "Relative Strength Index on 3 candles",
    weight: 0.10,
  },
  {
    patternKey: "emaSignal",
    patternName: "EMA Crossover",
    description: "EMA(3) vs EMA(5) crossover signal",
    weight: 0.10,
  },
  {
    patternKey: "bollingerPos",
    patternName: "Bollinger Bands",
    description: "Position within Bollinger Bands (0=lower, 100=upper)",
    weight: 0.08,
  },
  {
    patternKey: "vwapDeviation",
    patternName: "VWAP Deviation",
    description: "Distance from Volume-Weighted Average Price",
    weight: 0.05,
  },
  {
    patternKey: "wickBias",
    patternName: "Wick Bias",
    description: "Candle wick analysis — bullish vs bearish rejection",
    weight: 0.04,
  },
  {
    patternKey: "trendStrength",
    patternName: "Trend Strength",
    description: "Consecutive candle streak in same direction",
    weight: 0.03,
  },
];

// ---- Candle type ----
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
}

// ---- Technical Indicator Helpers ----
function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function computeVWAP(candles: Candle[]): number {
  let sumPV = 0;
  let sumV = 0;
  candles.forEach((c) => {
    const tp = (c.high + c.low + c.close) / 3;
    sumPV += tp * c.volume;
    sumV += c.volume;
  });
  return sumV > 0 ? sumPV / sumV : candles[candles.length - 1]?.close ?? 0;
}

function computeBollingerPos(closes: number[], period: number): number {
  if (closes.length < period) return 50;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = closes[closes.length - 1];
  const range = upper - lower;
  return range > 0 ? Math.max(0, Math.min(100, ((current - lower) / range) * 100)) : 50;
}

function computeRSI(candles: Candle[], period = 3): number {
  if (candles.length < 2) return 50;
  let gains = 0;
  let losses = 0;
  const changes = candles.slice(1).map((c, i) => c.close - candles[i].close);
  changes.slice(-period).forEach((ch) => {
    if (ch > 0) gains += ch;
    else losses += Math.abs(ch);
  });
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  return 100 - 100 / (1 + gains / losses);
}

// ---- Core prediction function ----
export function computePredictionWithWeights(
  candles: Candle[],
  weights: Record<string, number>
): { prediction: "UP" | "DOWN" | "NEUTRAL"; confidence: number; factors: Record<string, number> } {
  if (candles.length < 2) {
    return { prediction: "NEUTRAL", confidence: 0, factors: {} };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const closes = candles.map((c) => c.close);

  // 1. Momentum
  const priceChangePct = ((last.close - first.open) / first.open) * 100;
  const momentum = Math.max(-100, Math.min(100, priceChangePct * 200));

  // 2. Volume delta
  let bullVol = 0, bearVol = 0;
  candles.forEach((c) => { if (c.isBullish) bullVol += c.volume; else bearVol += c.volume; });
  const totalVol = bullVol + bearVol;
  const volumeDelta = totalVol > 0 ? ((bullVol - bearVol) / totalVol) * 100 : 0;

  // 3. Price velocity
  let velocity = 0;
  if (candles.length >= 3) {
    const mid = Math.floor(candles.length / 2);
    const firstHalf = candles[mid].close - candles[0].open;
    const secondHalf = last.close - candles[mid].open;
    velocity = Math.max(-100, Math.min(100, (secondHalf - firstHalf) / first.open * 5000));
  }

  // 4. RSI
  const rsiScore = computeRSI(candles, Math.min(3, candles.length - 1));

  // 5. EMA crossover
  const ema3 = computeEMA(closes, Math.min(3, closes.length));
  const ema5 = computeEMA(closes, Math.min(5, closes.length));
  const ema3Last = ema3[ema3.length - 1] ?? last.close;
  const ema5Last = ema5[ema5.length - 1] ?? last.close;
  const emaSignal = ema5Last > 0
    ? Math.max(-100, Math.min(100, ((ema3Last - ema5Last) / ema5Last) * 10000))
    : 0;

  // 6. Bollinger position
  const bollingerPos = computeBollingerPos(closes, Math.min(closes.length, 5));

  // 7. VWAP deviation
  const vwap = computeVWAP(candles);
  const vwapDeviation = vwap > 0
    ? Math.max(-100, Math.min(100, ((last.close - vwap) / vwap) * 10000))
    : 0;

  // 8. Wick bias
  let totalWickBias = 0;
  candles.forEach((c) => {
    const range = c.high - c.low;
    if (range > 0) {
      const upper = c.high - Math.max(c.open, c.close);
      const lower = Math.min(c.open, c.close) - c.low;
      const wickRange = upper + lower;
      if (wickRange > 0) totalWickBias += ((lower - upper) / wickRange) * 100;
    }
  });
  const wickBias = totalWickBias / candles.length;

  // 9. Trend strength
  let streak = 0;
  const lastDir = candles[candles.length - 1].isBullish;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].isBullish === lastDir) streak++;
    else break;
  }
  const trendStrength = Math.min(100, (streak / candles.length) * 100 + (lastDir ? 20 : -20) + 50);

  // ---- Weighted composite score ----
  const w = weights;
  const score =
    momentum                 * (w.momentum      ?? 0.25) +
    volumeDelta              * (w.volumeDelta    ?? 0.20) +
    velocity                 * (w.priceVelocity  ?? 0.15) +
    (rsiScore - 50) * 2      * (w.rsiScore       ?? 0.10) +
    emaSignal                * (w.emaSignal      ?? 0.10) +
    (bollingerPos - 50) * 2  * (w.bollingerPos   ?? 0.08) +
    vwapDeviation            * (w.vwapDeviation  ?? 0.05) +
    wickBias                 * (w.wickBias       ?? 0.04) +
    (trendStrength - 50) * 2 * (w.trendStrength  ?? 0.03);

  const absScore = Math.abs(score);
  const confidence = Math.min(95, Math.max(5, 50 + absScore * 0.75));

  let prediction: "UP" | "DOWN" | "NEUTRAL";
  if (absScore < 4) prediction = "NEUTRAL";
  else if (score > 0) prediction = "UP";
  else prediction = "DOWN";

  return {
    prediction,
    confidence,
    factors: {
      momentum: Math.round(momentum),
      volumeDelta: Math.round(volumeDelta),
      priceVelocity: Math.round(velocity),
      rsiScore: Math.round(rsiScore),
      emaSignal: Math.round(emaSignal),
      bollingerPos: Math.round(bollingerPos),
      vwapDeviation: Math.round(vwapDeviation),
      wickBias: Math.round(wickBias),
      trendStrength: Math.round(trendStrength),
      rawScore: Math.round(score * 10) / 10,
    },
  };
}

// ---- Get current ML weights from DB ----
export async function getMLWeights(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    if (!db) return getDefaultWeights();

    const [model] = await db
      .select()
      .from(mlModelState)
      .orderBy(desc(mlModelState.version))
      .limit(1);

    if (model?.weights && typeof model.weights === "object") {
      return model.weights as Record<string, number>;
    }
    return getDefaultWeights();
  } catch {
    return getDefaultWeights();
  }
}

// ---- Get enabled patterns from DB ----
export async function getEnabledPatterns(): Promise<Set<string>> {
  try {
    const db = await getDb();
    if (!db) return new Set(DEFAULT_PATTERNS.map((p) => p.patternKey));

    const patterns = await db.select().from(patternSettings);
    if (patterns.length === 0) return new Set(DEFAULT_PATTERNS.map((p) => p.patternKey));

    return new Set(patterns.filter((p) => p.enabled).map((p) => p.patternKey));
  } catch {
    return new Set(DEFAULT_PATTERNS.map((p) => p.patternKey));
  }
}

function getDefaultWeights(): Record<string, number> {
  return Object.fromEntries(DEFAULT_PATTERNS.map((p) => [p.patternKey, p.weight]));
}

// ---- Ensure default patterns exist in DB ----
async function ensureDefaultPatterns(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const existing = await db.select().from(patternSettings);
    if (existing.length > 0) return;

    for (const p of DEFAULT_PATTERNS) {
      await db.insert(patternSettings).values({
        patternKey: p.patternKey,
        patternName: p.patternName,
        description: p.description,
        enabled: true,
        weight: p.weight,
        mlWeight: p.weight,
        totalPredictions: 0,
        correctPredictions: 0,
        successRate: 0,
      });
    }
    console.log("[PredictionEngine] Default patterns initialized");
  } catch (err) {
    console.error("[PredictionEngine] Error initializing patterns:", err);
  }
}

// ---- Ensure scheduler config exists ----
async function ensureSchedulerConfig(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const existing = await db.select().from(schedulerConfig).limit(1);
    if (existing.length === 0) {
      await db.insert(schedulerConfig).values({
        enabled: true,
        intervalMinutes: 5,
        totalRuns: 0,
        consecutiveErrors: 0,
      });
      console.log("[PredictionEngine] Scheduler config initialized");
    }
  } catch (err) {
    console.error("[PredictionEngine] Error initializing scheduler config:", err);
  }
}

// ---- Fetch live BTC candles from Kraken ----
async function fetchLiveCandles(): Promise<Candle[]> {
  const res = await fetch("https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Kraken API error: ${res.status}`);

  const json = await res.json() as {
    result: { XXBTZUSD: [number, string, string, string, string, string, string, number][] };
    error: string[];
  };

  if (json.error && json.error.length > 0) throw new Error(`Kraken error: ${json.error[0]}`);

  const raw = json.result.XXBTZUSD;
  return raw.map((c) => {
    const o = parseFloat(c[1]);
    const h = parseFloat(c[2]);
    const l = parseFloat(c[3]);
    const cl = parseFloat(c[4]);
    const v = parseFloat(c[6]);
    return { time: c[0] * 1000, open: o, high: h, low: l, close: cl, volume: v, isBullish: cl >= o };
  });
}

// ---- Background prediction run ----
export async function runBackgroundPrediction(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.log("[Scheduler] No DB available, skipping prediction");
    return;
  }

  const [config] = await db.select().from(schedulerConfig).limit(1);
  if (!config?.enabled) {
    console.log("[Scheduler] Disabled, skipping prediction");
    return;
  }

  console.log("[Scheduler] Running background prediction...");

  try {
    // Fetch live candles
    const allCandles = await fetchLiveCandles();

    // Get current 5-min window
    const nowTs = Date.now();
    const windowStart = Math.floor(nowTs / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const windowEnd = windowStart + 5 * 60 * 1000;

    // Check if already predicted this window
    const existing = await db
      .select()
      .from(predictionWindows)
      .where(eq(predictionWindows.windowStart, windowStart))
      .limit(1);

    if (existing.length > 0 && existing[0].prediction) {
      console.log("[Scheduler] Window already predicted, skipping");
      await updateSchedulerStatus(db, config.id, "success");
      return;
    }

    // Get window candles (first 3 minutes)
    const windowCandles = allCandles.filter(
      (c) => c.time >= windowStart && c.time < windowStart + 3 * 60 * 1000
    );

    if (windowCandles.length < 2) {
      console.log("[Scheduler] Not enough candles for prediction, skipping");
      await updateSchedulerStatus(db, config.id, "success");
      return;
    }

    // Get ML weights and enabled patterns
    const mlWeights = await getMLWeights();
    const enabledPatterns = await getEnabledPatterns();

    // Zero out disabled patterns
    const activeWeights = { ...mlWeights };
    Object.keys(activeWeights).forEach((key) => {
      if (!enabledPatterns.has(key)) activeWeights[key] = 0;
    });

    // Run prediction
    const { prediction, confidence, factors } = computePredictionWithWeights(windowCandles, activeWeights);

    // Calculate price stats
    const openPrice = windowCandles[0].open;
    const highPrice = windowCandles.reduce((m, c) => Math.max(m, c.high), openPrice);
    const lowPrice = windowCandles.reduce((m, c) => Math.min(m, c.low), openPrice);
    const totalVolume = windowCandles.reduce((s, c) => s + c.volume, 0);

    // Save to DB
    if (existing.length > 0) {
      await db
        .update(predictionWindows)
        .set({
          prediction,
          predictionConfidence: confidence,
          predictionMadeAt: Date.now(),
          analysisFactors: { ...factors, signalStrength: Math.abs(factors.rawScore ?? 0) >= 25 ? "STRONG" : Math.abs(factors.rawScore ?? 0) >= 10 ? "MODERATE" : "WEAK" },
          source: "scheduler",
        })
        .where(eq(predictionWindows.id, existing[0].id));
    } else {
      await db.insert(predictionWindows).values({
        windowStart,
        windowEnd,
        prediction,
        predictionConfidence: confidence,
        predictionMadeAt: Date.now(),
        openPrice,
        highPrice,
        lowPrice,
        totalVolume,
        analysisFactors: { ...factors, signalStrength: Math.abs(factors.rawScore ?? 0) >= 25 ? "STRONG" : Math.abs(factors.rawScore ?? 0) >= 10 ? "MODERATE" : "WEAK" },
        source: "scheduler",
      });
    }

    // Also finalize previous window if not done
    await finalizeCompletedWindows(db, allCandles);

    await updateSchedulerStatus(db, config.id, "success");
    console.log(`[Scheduler] Prediction: ${prediction} (${confidence.toFixed(1)}%) for window ${new Date(windowStart).toISOString()}`);
  } catch (err) {
    console.error("[Scheduler] Error:", err);
    await updateSchedulerStatus(db, config.id, "error", String(err));
  }
}

async function updateSchedulerStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  configId: number,
  status: "success" | "error",
  errorMsg?: string
): Promise<void> {
  if (!db) return;
  await db
    .update(schedulerConfig)
    .set({
      lastRunAt: new Date(),
      lastRunStatus: status,
      totalRuns: sql`${schedulerConfig.totalRuns} + 1`,
      consecutiveErrors: status === "error"
        ? sql`${schedulerConfig.consecutiveErrors} + 1`
        : 0,
    })
    .where(eq(schedulerConfig.id, configId));
}

// ---- Finalize completed windows ----
async function finalizeCompletedWindows(
  db: Awaited<ReturnType<typeof getDb>>,
  allCandles: Candle[]
): Promise<void> {
  if (!db) return;

  try {
    const nowTs = Date.now();
    const currentWindowStart = Math.floor(nowTs / (5 * 60 * 1000)) * (5 * 60 * 1000);

    // Find windows that need finalization
    const unfinalized = await db
      .select()
      .from(predictionWindows)
      .where(
        and(
          isNotNull(predictionWindows.prediction),
          eq(predictionWindows.actualResult, null as unknown as "UP")
        )
      )
      .limit(10);

    for (const win of unfinalized) {
      if (win.windowEnd > nowTs) continue; // Window not closed yet

      // Get candles for this window
      const winCandles = allCandles.filter(
        (c) => c.time >= win.windowStart && c.time < win.windowEnd
      );

      if (winCandles.length === 0) continue;

      const sorted = winCandles.sort((a, b) => a.time - b.time);
      const closePrice = sorted[sorted.length - 1].close;
      const openPrice = win.openPrice ?? sorted[0].open;
      const highPrice = sorted.reduce((m, c) => Math.max(m, c.high), openPrice);
      const lowPrice = sorted.reduce((m, c) => Math.min(m, c.low), openPrice);
      const totalVolume = sorted.reduce((s, c) => s + c.volume, 0);
      const priceChangePct = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;
      const actualResult: "UP" | "DOWN" = closePrice >= openPrice ? "UP" : "DOWN";
      const predictionCorrect = win.prediction ? win.prediction === actualResult : null;

      await db
        .update(predictionWindows)
        .set({
          closePrice,
          actualResult,
          predictionCorrect: predictionCorrect ?? undefined,
          priceChangePct,
          highPrice,
          lowPrice,
          totalVolume,
        })
        .where(eq(predictionWindows.id, win.id));
    }
  } catch (err) {
    console.error("[Scheduler] Error finalizing windows:", err);
  }
}

// ---- ML Training ----
export async function runMLTraining(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.log("[ML] No DB available, skipping training");
    return;
  }

  console.log("[ML] Starting training...");

  try {
    // Mark as training
    const [existingModel] = await db
      .select()
      .from(mlModelState)
      .orderBy(desc(mlModelState.version))
      .limit(1);

    if (existingModel) {
      await db
        .update(mlModelState)
        .set({ status: "training" })
        .where(eq(mlModelState.id, existingModel.id));
    }

    // Get all finalized windows with predictions
    const windows = await db
      .select()
      .from(predictionWindows)
      .where(
        and(
          isNotNull(predictionWindows.prediction),
          isNotNull(predictionWindows.actualResult),
          isNotNull(predictionWindows.analysisFactors)
        )
      )
      .orderBy(desc(predictionWindows.windowStart))
      .limit(500);

    if (windows.length < 10) {
      console.log("[ML] Not enough training data (need 10+, have", windows.length, ")");
      if (existingModel) {
        await db
          .update(mlModelState)
          .set({ status: "idle" })
          .where(eq(mlModelState.id, existingModel.id));
      }
      return;
    }

    console.log(`[ML] Training on ${windows.length} samples...`);

    // Get current weights
    const currentWeights = existingModel?.weights
      ? (existingModel.weights as Record<string, number>)
      : getDefaultWeights();

    // ---- Gradient descent training ----
    const LEARNING_RATE = 0.01;
    const EPOCHS = 50;
    const FACTOR_KEYS = [
      "momentum", "volumeDelta", "priceVelocity", "rsiScore",
      "emaSignal", "bollingerPos", "vwapDeviation", "wickBias", "trendStrength",
    ];

    let weights = { ...currentWeights };

    // Normalize factors to [-1, 1] range
    const normalizeFactors = (factors: Record<string, number>): Record<string, number> => ({
      momentum: (factors.momentum ?? 0) / 100,
      volumeDelta: (factors.volumeDelta ?? 0) / 100,
      priceVelocity: (factors.priceVelocity ?? 0) / 100,
      rsiScore: ((factors.rsiScore ?? 50) - 50) / 50,
      emaSignal: (factors.emaSignal ?? 0) / 100,
      bollingerPos: ((factors.bollingerPos ?? 50) - 50) / 50,
      vwapDeviation: (factors.vwapDeviation ?? 0) / 100,
      wickBias: (factors.wickBias ?? 0) / 100,
      trendStrength: ((factors.trendStrength ?? 50) - 50) / 50,
    });

    // Prepare training data
    const trainingData = windows
      .filter((w) => w.analysisFactors && w.actualResult && w.prediction)
      .map((w) => {
        const factors = w.analysisFactors as Record<string, number>;
        const normalizedFactors = normalizeFactors(factors);
        const label = w.actualResult === "UP" ? 1 : -1;
        return { factors: normalizedFactors, label };
      });

    let lastAccuracy = 0;

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      const gradients: Record<string, number> = {};
      FACTOR_KEYS.forEach((k) => { gradients[k] = 0; });

      let correct = 0;

      for (const sample of trainingData) {
        // Forward pass: compute weighted score
        let score = 0;
        FACTOR_KEYS.forEach((k) => {
          score += (weights[k] ?? 0) * (sample.factors[k] ?? 0);
        });

        // Sigmoid activation
        const predicted = 1 / (1 + Math.exp(-score * 5));
        const target = sample.label === 1 ? 1 : 0;
        const error = predicted - target;

        // Track accuracy
        if ((predicted > 0.5 && sample.label === 1) || (predicted <= 0.5 && sample.label === -1)) {
          correct++;
        }

        // Backward pass: compute gradients
        const dLoss = error * predicted * (1 - predicted) * 5;
        FACTOR_KEYS.forEach((k) => {
          gradients[k] += dLoss * (sample.factors[k] ?? 0);
        });
      }

      // Update weights
      FACTOR_KEYS.forEach((k) => {
        const grad = gradients[k] / trainingData.length;
        weights[k] = Math.max(0.001, (weights[k] ?? 0.1) - LEARNING_RATE * grad);
      });

      lastAccuracy = (correct / trainingData.length) * 100;
    }

    // Normalize weights to sum to 1
    const totalWeight = FACTOR_KEYS.reduce((s, k) => s + (weights[k] ?? 0), 0);
    if (totalWeight > 0) {
      FACTOR_KEYS.forEach((k) => { weights[k] = (weights[k] ?? 0) / totalWeight; });
    }

    console.log(`[ML] Training complete. Accuracy: ${lastAccuracy.toFixed(1)}%`);
    console.log("[ML] New weights:", JSON.stringify(weights, null, 2));

    // Update per-pattern success rates
    const patternStats: Record<string, { total: number; correct: number }> = {};
    FACTOR_KEYS.forEach((k) => { patternStats[k] = { total: 0, correct: 0 }; });

    for (const w of windows) {
      if (!w.analysisFactors || !w.actualResult) continue;
      const factors = w.analysisFactors as Record<string, number>;
      const actualUp = w.actualResult === "UP";

      FACTOR_KEYS.forEach((k) => {
        const factorValue = factors[k] ?? 0;
        const factorPredictedUp = factorValue > 0;
        patternStats[k].total++;
        if (factorPredictedUp === actualUp) patternStats[k].correct++;
      });
    }

    // Update pattern settings in DB
    for (const [key, stats] of Object.entries(patternStats)) {
      const successRate = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
      const existing = await db
        .select()
        .from(patternSettings)
        .where(eq(patternSettings.patternKey, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(patternSettings)
          .set({
            totalPredictions: stats.total,
            correctPredictions: stats.correct,
            successRate,
            mlWeight: weights[key] ?? 0.1,
          })
          .where(eq(patternSettings.patternKey, key));
      }
    }

    // Save model state
    const bestAccuracy = Math.max(lastAccuracy, existingModel?.bestAccuracy ?? 0);
    const newVersion = (existingModel?.version ?? 0) + 1;
    const newRounds = (existingModel?.trainingRounds ?? 0) + 1;

    if (existingModel) {
      await db
        .update(mlModelState)
        .set({
          version: newVersion,
          weights,
          trainingRounds: newRounds,
          totalSamples: trainingData.length,
          lastTrainingAccuracy: lastAccuracy,
          bestAccuracy,
          status: "ready",
          lastTrainedAt: new Date(),
        })
        .where(eq(mlModelState.id, existingModel.id));
    } else {
      await db.insert(mlModelState).values({
        version: 1,
        weights,
        trainingRounds: 1,
        totalSamples: trainingData.length,
        lastTrainingAccuracy: lastAccuracy,
        bestAccuracy: lastAccuracy,
        status: "ready",
        lastTrainedAt: new Date(),
      });
    }

    console.log("[ML] Model saved to DB");
  } catch (err) {
    console.error("[ML] Training error:", err);
    const db2 = await getDb();
    if (db2) {
      const [m] = await db2.select().from(mlModelState).limit(1);
      if (m) {
        await db2.update(mlModelState).set({ status: "idle" }).where(eq(mlModelState.id, m.id));
      }
    }
  }
}

// ---- Background Scheduler ----
let schedulerInterval: NodeJS.Timeout | null = null;
let mlTrainingInterval: NodeJS.Timeout | null = null;
let isInitialized = false;

export function startBackgroundScheduler(): void {
  if (isInitialized) return;
  isInitialized = true;

  console.log("[Scheduler] Starting background prediction scheduler...");

  // Initialize DB records
  setTimeout(async () => {
    await ensureDefaultPatterns();
    await ensureSchedulerConfig();

    // Run initial prediction after 30 seconds
    setTimeout(() => {
      runBackgroundPrediction().catch(console.error);
    }, 30000);
  }, 5000);

  // Run every 5 minutes
  schedulerInterval = setInterval(() => {
    runBackgroundPrediction().catch(console.error);
  }, 5 * 60 * 1000);

  // Run ML training every 30 minutes
  mlTrainingInterval = setInterval(() => {
    runMLTraining().catch(console.error);
  }, 30 * 60 * 1000);

  // Initial ML training after 2 minutes
  setTimeout(() => {
    runMLTraining().catch(console.error);
  }, 2 * 60 * 1000);

  console.log("[Scheduler] Background scheduler started (5-min predictions, 30-min ML training)");
}

export function stopBackgroundScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (mlTrainingInterval) {
    clearInterval(mlTrainingInterval);
    mlTrainingInterval = null;
  }
  isInitialized = false;
  console.log("[Scheduler] Background scheduler stopped");
}
