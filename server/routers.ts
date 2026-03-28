import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import {
  predictionWindows,
  patternSettings,
  mlModelState,
  schedulerConfig,
  predictionRevisions,
} from "../drizzle/schema";
import { eq, desc, and, isNotNull, gte, sql } from "drizzle-orm";
import {
  runMLTraining,
  runBackgroundPrediction,
  DEFAULT_PATTERNS,
  computePredictionWithWeights,
  getMLWeights,
  getEnabledPatterns,
} from "./predictionEngine";

// ---- Lightweight OpenAI-compatible LLM call ----
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.BUILT_IN_FORGE_API_KEY;
  const baseUrl = (
    process.env.OPENAI_BASE_URL ||
    process.env.BUILT_IN_FORGE_API_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiKey) throw new Error("No API key available for LLM");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error: ${res.status} ${err}`);
  }

  const json = await res.json() as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message?.content ?? "{}";
}

// Kraken free public API
const KRAKEN_BASE = "https://api.kraken.com/0/public";

// Simple in-memory cache
const cache: Record<string, { data: unknown; expiry: number }> = {};

function getCached(key: string): unknown | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    delete cache[key];
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: unknown, ttlSeconds = 10): void {
  cache[key] = { data, expiry: Date.now() + ttlSeconds * 1000 };
}

async function fetchKraken(path: string): Promise<unknown> {
  const cacheKey = `kraken:${path}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${KRAKEN_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Kraken API error: ${res.status}`);
  const json = await res.json();
  if (json.error && json.error.length > 0) throw new Error(`Kraken API error: ${json.error[0]}`);

  setCached(cacheKey, json.result, 10);
  return json.result;
}

// ---- AI Prediction Input Schema ----
const CandleSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  isBullish: z.boolean(),
});

const FactorsSchema = z.object({
  momentum: z.number(),
  volumeDelta: z.number(),
  priceVelocity: z.number(),
  rsiScore: z.number(),
  emaSignal: z.number(),
  bollingerPos: z.number(),
  vwapDeviation: z.number(),
  bodyRatio: z.number(),
  wickBias: z.number(),
  trendStrength: z.number(),
  rawScore: z.number(),
  signalStrength: z.enum(["STRONG", "MODERATE", "WEAK"]),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Bitcoin data proxy
  btc: router({
    klines: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(30) }))
      .query(async ({ input }) => {
        try {
          const result = await fetchKraken("/OHLC?pair=XBTUSD&interval=1") as Record<string, unknown[]>;
          const data = result.XXBTZUSD as [number, string, string, string, string, string, string, number][];
          if (!data || data.length === 0) throw new Error("No OHLC data returned from Kraken");
          const recent = data.slice(-input.limit).map((candle) => [
            candle[0] * 1000,
            candle[1],
            candle[2],
            candle[3],
            candle[4],
            candle[6],
            "0",
          ]) as [number, string, string, string, string, string, string][];
          return recent;
        } catch (error) {
          console.error("[Kraken klines error]", error);
          throw error;
        }
      }),

    ticker: publicProcedure.query(async () => {
      try {
        const result = await fetchKraken("/Ticker?pair=XBTUSD") as Record<string, Record<string, unknown[]>>;
        const ticker = result.XXBTZUSD as Record<string, unknown[]>;
        const lastPrice = parseFloat((ticker.c as string[])[0]);
        const high24h = parseFloat((ticker.h as string[])[1]);
        const low24h = parseFloat((ticker.l as string[])[1]);
        const volume24h = parseFloat((ticker.v as string[])[1]);
        const open24h = parseFloat((ticker.o as string[])[1]);
        const change24h = lastPrice - open24h;
        const changePct24h = open24h > 0 ? (change24h / open24h) * 100 : 0;
        return {
          price: lastPrice,
          priceChange24h: change24h,
          priceChangePct24h: changePct24h,
          high24h,
          low24h,
          volume24h,
          lastUpdate: Date.now(),
        };
      } catch (error) {
        console.error("[Kraken ticker error]", error);
        throw error;
      }
    }),

    recent: publicProcedure.query(async () => {
      try {
        const result = await fetchKraken("/OHLC?pair=XBTUSD&interval=1") as Record<string, unknown[]>;
        const data = result.XXBTZUSD as [number, string, string, string, string, string, string, number][];
        if (!data || data.length === 0) throw new Error("No recent candles returned from Kraken");
        const recent = data.slice(-6).map((candle) => [
          candle[0] * 1000,
          candle[1],
          candle[2],
          candle[3],
          candle[4],
          candle[6],
          "0",
        ]) as [number, string, string, string, string, string, string][];
        return recent;
      } catch (error) {
        console.error("[Kraken recent error]", error);
        throw error;
      }
    }),

    aiPredict: publicProcedure
      .input(z.object({
        candles: z.array(CandleSchema),
        factors: FactorsSchema,
        mathPrediction: z.enum(["UP", "DOWN", "NEUTRAL"]),
        mathConfidence: z.number(),
        sessionAccuracy: z.number(),
        windowStart: z.number(),
      }))
      .mutation(async ({ input }) => {
        const cacheKey = `ai_predict:${input.windowStart}`;
        const cached = getCached(cacheKey);
        if (cached) return cached as AIPredictionResult;

        try {
          const { candles, factors, mathPrediction, mathConfidence, sessionAccuracy } = input;
          const candleSummary = candles.map((c, i) => {
            const dir = c.isBullish ? "▲" : "▼";
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            const bodyPct = range > 0 ? ((body / range) * 100).toFixed(0) : "0";
            return `  Candle ${i + 1}: ${dir} O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} Vol:${c.volume.toFixed(4)} Body:${bodyPct}%`;
          }).join("\n");

          const prompt = `You are an expert quantitative crypto trader analyzing BTC/USDT for a 5-minute binary prediction (will price be HIGHER or LOWER at window close vs window open?).

## Market Data (last 3 minutes of current 5-min window)
${candleSummary}

## Technical Indicators
- Momentum: ${factors.momentum} (price change strength, -100 to +100)
- Volume Delta: ${factors.volumeDelta} (bull vs bear volume, -100 to +100)
- Price Velocity: ${factors.priceVelocity} (acceleration, -100 to +100)
- RSI(3): ${factors.rsiScore}/100
- EMA Signal: ${factors.emaSignal} (EMA3 vs EMA5 crossover)
- Bollinger Position: ${factors.bollingerPos}/100 (0=lower band, 100=upper band)
- VWAP Deviation: ${factors.vwapDeviation} (% from VWAP)
- Candle Body Ratio: ${factors.bodyRatio}/100 (conviction strength)
- Wick Bias: ${factors.wickBias} (+= bullish rejection, -= bearish rejection)
- Trend Strength: ${factors.trendStrength}/100
- Composite Score: ${factors.rawScore} (${factors.signalStrength} signal)

## Mathematical Model Output
- Prediction: ${mathPrediction}
- Confidence: ${mathConfidence.toFixed(1)}%
- Session Accuracy: ${sessionAccuracy}%

## Your Task
Analyze all signals and provide:
1. Your independent prediction (UP, DOWN, or SKIP if too risky/unclear)
2. Confidence level (0-100%)
3. Risk level (LOW, MEDIUM, HIGH)
4. A brief reasoning (2-3 sentences max)
5. Key supporting signals (up to 3 bullet points)
6. Key risk factors (up to 2 bullet points)

Respond in JSON only. Be decisive but honest about uncertainty. SKIP means the risk/reward is unfavorable.`;

          const text = await callLLM(prompt);
          const parsed = JSON.parse(text) as AIPredictionResult;
          setCached(cacheKey, parsed, 60);
          return parsed;
        } catch (error) {
          console.error("[AI Predict error]", error);
          const fallback: AIPredictionResult = {
            prediction: "SKIP",
            confidence: 0,
            riskLevel: "HIGH",
            reasoning: "AI analysis temporarily unavailable. Rely on mathematical model only.",
            supportingSignals: [],
            riskFactors: ["AI service unavailable"],
          };
          return fallback;
        }
      }),

    // Mid-window prediction revision with cashout guidance
    midWindowRevision: publicProcedure
      .input(z.object({
        candles: z.array(CandleSchema),
        factors: FactorsSchema,
        originalPrediction: z.enum(["UP", "DOWN", "NEUTRAL"]),
        originalConfidence: z.number(),
        currentPrice: z.number(),
        openPrice: z.number(),
        minuteIntoWindow: z.number(),
        windowStart: z.number(),
      }))
      .mutation(async ({ input }) => {
        const cacheKey = `mid_revision:${input.windowStart}:${Math.floor(input.minuteIntoWindow)}`;
        const cached = getCached(cacheKey);
        if (cached) return cached as MidWindowRevision;

        try {
          const { candles, factors, originalPrediction, originalConfidence, currentPrice, openPrice, minuteIntoWindow } = input;
          const priceChangePct = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;

          // Get ML weights for server-side re-prediction
          const mlWeights = await getMLWeights();
          const enabledPatterns = await getEnabledPatterns();
          const activeWeights = { ...mlWeights };
          Object.keys(activeWeights).forEach((key) => {
            if (!enabledPatterns.has(key)) activeWeights[key] = 0;
          });

          const serverCandles = candles.map(c => ({ ...c }));
          const { prediction: newPrediction, confidence: newConfidence } = computePredictionWithWeights(serverCandles, activeWeights);

          // Determine if revision is significant
          const confidenceChange = Math.abs(newConfidence - originalConfidence);
          const predictionChanged = newPrediction !== originalPrediction && newPrediction !== "NEUTRAL";
          const shouldRevise = confidenceChange > 10 || predictionChanged;

          // Cashout guidance
          let cashoutGuidance: CashoutGuidance | null = null;
          if (minuteIntoWindow > 2) {
            cashoutGuidance = computeCashoutGuidance(
              originalPrediction,
              newPrediction,
              originalConfidence,
              newConfidence,
              priceChangePct,
              minuteIntoWindow
            );
          }

          const result: MidWindowRevision = {
            shouldRevise,
            newPrediction: shouldRevise ? newPrediction : originalPrediction,
            newConfidence: shouldRevise ? newConfidence : originalConfidence,
            predictionChanged,
            confidenceChange,
            priceChangePct,
            cashoutGuidance,
            revisedAt: Date.now(),
          };

          setCached(cacheKey, result, 30);

          // Store revision in DB if significant
          if (shouldRevise) {
            const db = await getDb();
            if (db) {
              const [existingWindow] = await db
                .select()
                .from(predictionWindows)
                .where(eq(predictionWindows.windowStart, input.windowStart))
                .limit(1);

              if (existingWindow) {
                const revisionCount = await db
                  .select({ count: sql<number>`count(*)` })
                  .from(predictionRevisions)
                  .where(eq(predictionRevisions.windowId, existingWindow.id));

                await db.insert(predictionRevisions).values({
                  windowId: existingWindow.id,
                  windowStart: input.windowStart,
                  revisionNumber: (revisionCount[0]?.count ?? 0) + 1,
                  previousPrediction: originalPrediction,
                  newPrediction: newPrediction as "UP" | "DOWN" | "NEUTRAL",
                  previousConfidence: originalConfidence,
                  newConfidence,
                  reason: predictionChanged
                    ? `Prediction flipped from ${originalPrediction} to ${newPrediction} at ${minuteIntoWindow.toFixed(1)} min`
                    : `Confidence changed by ${confidenceChange.toFixed(1)}%`,
                  minuteIntoWindow,
                  analysisFactors: factors as unknown as Record<string, unknown>,
                });
              }
            }
          }

          return result;
        } catch (error) {
          console.error("[Mid-window revision error]", error);
          return {
            shouldRevise: false,
            newPrediction: input.originalPrediction,
            newConfidence: input.originalConfidence,
            predictionChanged: false,
            confidenceChange: 0,
            priceChangePct: 0,
            cashoutGuidance: null,
            revisedAt: Date.now(),
          } as MidWindowRevision;
        }
      }),
  }),

  // Prediction history from DB
  history: router({
    list: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { windows: [], total: 0 };

          const windows = await db
            .select()
            .from(predictionWindows)
            .orderBy(desc(predictionWindows.windowStart))
            .limit(input.limit)
            .offset(input.offset);

          const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(predictionWindows);

          return { windows, total: count };
        } catch (error) {
          console.error("[History list error]", error);
          return { windows: [], total: 0 };
        }
      }),

    // Save a prediction window from the browser
    save: publicProcedure
      .input(z.object({
        windowStart: z.number(),
        windowEnd: z.number(),
        prediction: z.enum(["UP", "DOWN", "NEUTRAL"]).nullable(),
        predictionConfidence: z.number(),
        predictionMadeAt: z.number().nullable(),
        openPrice: z.number(),
        highPrice: z.number(),
        lowPrice: z.number(),
        totalVolume: z.number(),
        analysisFactors: z.record(z.string(), z.unknown()).nullable(),
        source: z.string().default("browser"),
      }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { success: false };

          // Check if already exists
          const existing = await db
            .select()
            .from(predictionWindows)
            .where(eq(predictionWindows.windowStart, input.windowStart))
            .limit(1);

          if (existing.length > 0) {
            // Update if new prediction is available
            if (input.prediction && !existing[0].prediction) {
              await db
                .update(predictionWindows)
                .set({
                  prediction: input.prediction,
                  predictionConfidence: input.predictionConfidence,
                  predictionMadeAt: input.predictionMadeAt,
                  analysisFactors: input.analysisFactors as Record<string, unknown>,
                  source: input.source,
                })
                .where(eq(predictionWindows.id, existing[0].id));
            }
            return { success: true, id: existing[0].id };
          }

          const [result] = await db.insert(predictionWindows).values({
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
            prediction: input.prediction ?? undefined,
            predictionConfidence: input.predictionConfidence,
            predictionMadeAt: input.predictionMadeAt ?? undefined,
            openPrice: input.openPrice,
            highPrice: input.highPrice,
            lowPrice: input.lowPrice,
            totalVolume: input.totalVolume,
            analysisFactors: input.analysisFactors as Record<string, unknown>,
            source: input.source,
          });

          return { success: true, id: (result as { insertId: number }).insertId };
        } catch (error) {
          console.error("[History save error]", error);
          return { success: false };
        }
      }),

    // Finalize a window with actual outcome
    finalize: publicProcedure
      .input(z.object({
        windowStart: z.number(),
        closePrice: z.number(),
        actualResult: z.enum(["UP", "DOWN"]),
        predictionCorrect: z.boolean().nullable(),
        priceChangePct: z.number(),
        highPrice: z.number(),
        lowPrice: z.number(),
        totalVolume: z.number(),
      }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { success: false };

          await db
            .update(predictionWindows)
            .set({
              closePrice: input.closePrice,
              actualResult: input.actualResult,
              predictionCorrect: input.predictionCorrect ?? undefined,
              priceChangePct: input.priceChangePct,
              highPrice: input.highPrice,
              lowPrice: input.lowPrice,
              totalVolume: input.totalVolume,
            })
            .where(eq(predictionWindows.windowStart, input.windowStart));

          return { success: true };
        } catch (error) {
          console.error("[History finalize error]", error);
          return { success: false };
        }
      }),

    // Get stats summary
    stats: publicProcedure.query(async () => {
      try {
        const db = await getDb();
        if (!db) return null;

        const [total] = await db
          .select({ count: sql<number>`count(*)` })
          .from(predictionWindows)
          .where(isNotNull(predictionWindows.prediction));

        const [correct] = await db
          .select({ count: sql<number>`count(*)` })
          .from(predictionWindows)
          .where(eq(predictionWindows.predictionCorrect, true));

        const [schedulerRun] = await db.select().from(schedulerConfig).limit(1);

        return {
          totalPredictions: total.count,
          correctPredictions: correct.count,
          accuracy: total.count > 0 ? (correct.count / total.count) * 100 : 0,
          schedulerEnabled: schedulerRun?.enabled ?? false,
          schedulerLastRun: schedulerRun?.lastRunAt?.toISOString() ?? null,
          schedulerTotalRuns: schedulerRun?.totalRuns ?? 0,
        };
      } catch (error) {
        console.error("[History stats error]", error);
        return null;
      }
    }),
  }),

  // Pattern settings management
  patterns: router({
    list: publicProcedure.query(async () => {
      try {
        const db = await getDb();
        if (!db) {
          // Return defaults if no DB
          return DEFAULT_PATTERNS.map((p) => ({
            id: 0,
            patternKey: p.patternKey,
            patternName: p.patternName,
            description: p.description ?? "",
            enabled: true,
            weight: p.weight,
            totalPredictions: 0,
            correctPredictions: 0,
            successRate: 0,
            mlWeight: p.weight,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }

        const patterns = await db.select().from(patternSettings).orderBy(desc(patternSettings.successRate));

        // If no patterns in DB, return defaults
        if (patterns.length === 0) {
          return DEFAULT_PATTERNS.map((p) => ({
            id: 0,
            patternKey: p.patternKey,
            patternName: p.patternName,
            description: p.description ?? "",
            enabled: true,
            weight: p.weight,
            totalPredictions: 0,
            correctPredictions: 0,
            successRate: 0,
            mlWeight: p.weight,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }

        return patterns;
      } catch (error) {
        console.error("[Patterns list error]", error);
        return DEFAULT_PATTERNS.map((p) => ({
          id: 0,
          patternKey: p.patternKey,
          patternName: p.patternName,
          description: p.description ?? "",
          enabled: true,
          weight: p.weight,
          totalPredictions: 0,
          correctPredictions: 0,
          successRate: 0,
          mlWeight: p.weight,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      }
    }),

    toggle: publicProcedure
      .input(z.object({
        patternKey: z.string(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { success: false };

          await db
            .update(patternSettings)
            .set({ enabled: input.enabled })
            .where(eq(patternSettings.patternKey, input.patternKey));

          return { success: true };
        } catch (error) {
          console.error("[Pattern toggle error]", error);
          return { success: false };
        }
      }),

    updateWeight: publicProcedure
      .input(z.object({
        patternKey: z.string(),
        weight: z.number().min(0).max(1),
      }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { success: false };

          await db
            .update(patternSettings)
            .set({ weight: input.weight })
            .where(eq(patternSettings.patternKey, input.patternKey));

          return { success: true };
        } catch (error) {
          console.error("[Pattern weight error]", error);
          return { success: false };
        }
      }),
  }),

  // ML model management
  ml: router({
    status: publicProcedure.query(async () => {
      try {
        const db = await getDb();
        if (!db) {
          return {
            version: 1,
            trainingRounds: 0,
            totalSamples: 0,
            lastTrainingAccuracy: null,
            bestAccuracy: null,
            status: "idle" as const,
            lastTrainedAt: null,
            weights: null,
          };
        }

        const [model] = await db
          .select()
          .from(mlModelState)
          .orderBy(desc(mlModelState.version))
          .limit(1);

        if (!model) {
          return {
            version: 1,
            trainingRounds: 0,
            totalSamples: 0,
            lastTrainingAccuracy: null,
            bestAccuracy: null,
            status: "idle" as const,
            lastTrainedAt: null,
            weights: null,
          };
        }

        return {
          version: model.version,
          trainingRounds: model.trainingRounds,
          totalSamples: model.totalSamples,
          lastTrainingAccuracy: model.lastTrainingAccuracy,
          bestAccuracy: model.bestAccuracy,
          status: model.status,
          lastTrainedAt: model.lastTrainedAt?.toISOString() ?? null,
          weights: model.weights as Record<string, number> | null,
        };
      } catch (error) {
        console.error("[ML status error]", error);
        return {
          version: 1,
          trainingRounds: 0,
          totalSamples: 0,
          lastTrainingAccuracy: null,
          bestAccuracy: null,
          status: "idle" as const,
          lastTrainedAt: null,
          weights: null,
        };
      }
    }),

    triggerTraining: publicProcedure.mutation(async () => {
      try {
        // Run training asynchronously
        runMLTraining().catch(console.error);
        return { success: true, message: "ML training started" };
      } catch (error) {
        console.error("[ML trigger error]", error);
        return { success: false, message: "Failed to start training" };
      }
    }),
  }),

  // Scheduler management
  scheduler: router({
    status: publicProcedure.query(async () => {
      try {
        const db = await getDb();
        if (!db) return { enabled: false, totalRuns: 0, lastRunAt: null, lastRunStatus: null };

        const [config] = await db.select().from(schedulerConfig).limit(1);
        if (!config) return { enabled: false, totalRuns: 0, lastRunAt: null, lastRunStatus: null };

        return {
          enabled: config.enabled,
          totalRuns: config.totalRuns,
          lastRunAt: config.lastRunAt?.toISOString() ?? null,
          lastRunStatus: config.lastRunStatus,
          consecutiveErrors: config.consecutiveErrors,
        };
      } catch (error) {
        console.error("[Scheduler status error]", error);
        return { enabled: false, totalRuns: 0, lastRunAt: null, lastRunStatus: null };
      }
    }),

    toggle: publicProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        try {
          const db = await getDb();
          if (!db) return { success: false };

          const existing = await db.select().from(schedulerConfig).limit(1);
          if (existing.length === 0) {
            await db.insert(schedulerConfig).values({ enabled: input.enabled, totalRuns: 0, consecutiveErrors: 0 });
          } else {
            await db
              .update(schedulerConfig)
              .set({ enabled: input.enabled })
              .where(eq(schedulerConfig.id, existing[0].id));
          }

          return { success: true };
        } catch (error) {
          console.error("[Scheduler toggle error]", error);
          return { success: false };
        }
      }),

    triggerNow: publicProcedure.mutation(async () => {
      try {
        runBackgroundPrediction().catch(console.error);
        return { success: true, message: "Background prediction triggered" };
      } catch (error) {
        return { success: false, message: "Failed to trigger prediction" };
      }
    }),
  }),
});

// ---- Type exports ----
export type AIPredictionResult = {
  prediction: "UP" | "DOWN" | "SKIP";
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  supportingSignals: string[];
  riskFactors: string[];
};

export type CashoutGuidance = {
  recommendation: "HOLD" | "CASHOUT" | "CONSIDER_CASHOUT";
  urgency: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  currentPnL: number; // estimated P&L %
  riskScore: number; // 0-100
};

export type MidWindowRevision = {
  shouldRevise: boolean;
  newPrediction: "UP" | "DOWN" | "NEUTRAL";
  newConfidence: number;
  predictionChanged: boolean;
  confidenceChange: number;
  priceChangePct: number;
  cashoutGuidance: CashoutGuidance | null;
  revisedAt: number;
};

// ---- Cashout guidance logic ----
function computeCashoutGuidance(
  originalPrediction: string,
  newPrediction: string,
  originalConfidence: number,
  newConfidence: number,
  priceChangePct: number,
  minuteIntoWindow: number
): CashoutGuidance {
  const predictionFlipped = originalPrediction !== newPrediction && newPrediction !== "NEUTRAL";
  const confidenceDrop = originalConfidence - newConfidence;
  const timeLeft = 5 - minuteIntoWindow;

  // Estimate current P&L (simplified: if bet UP and price went up, positive)
  const betDirection = originalPrediction === "UP" ? 1 : -1;
  const currentPnL = priceChangePct * betDirection;

  let recommendation: "HOLD" | "CASHOUT" | "CONSIDER_CASHOUT" = "HOLD";
  let urgency: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  let reason = "";
  let riskScore = 0;

  if (predictionFlipped) {
    // Model now says opposite direction
    recommendation = "CASHOUT";
    urgency = "HIGH";
    reason = `Model reversed: now predicting ${newPrediction} (${newConfidence.toFixed(0)}% conf). Original ${originalPrediction} bet at risk.`;
    riskScore = 80 + (newConfidence / 100) * 20;
  } else if (confidenceDrop > 20) {
    recommendation = "CONSIDER_CASHOUT";
    urgency = "MEDIUM";
    reason = `Confidence dropped ${confidenceDrop.toFixed(0)}% — signal weakening. ${timeLeft.toFixed(1)} min remaining.`;
    riskScore = 50 + confidenceDrop;
  } else if (currentPnL > 0.1 && timeLeft < 1.5) {
    recommendation = "CONSIDER_CASHOUT";
    urgency = "MEDIUM";
    reason = `In profit (${currentPnL.toFixed(2)}%) with ${timeLeft.toFixed(1)} min left. Consider locking in gains.`;
    riskScore = 40;
  } else if (currentPnL < -0.15) {
    recommendation = "CONSIDER_CASHOUT";
    urgency = "HIGH";
    reason = `Price moved against prediction (${currentPnL.toFixed(2)}%). Cut losses if trend continues.`;
    riskScore = 70;
  } else {
    recommendation = "HOLD";
    urgency = "LOW";
    reason = `Signal holding at ${newConfidence.toFixed(0)}% confidence. ${timeLeft.toFixed(1)} min remaining.`;
    riskScore = 20;
  }

  return { recommendation, urgency, reason, currentPnL, riskScore: Math.min(100, riskScore) };
}

export type AppRouter = typeof appRouter;
