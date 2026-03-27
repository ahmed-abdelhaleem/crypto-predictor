import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

// ---- Lightweight OpenAI-compatible LLM call (works on Railway with OPENAI_API_KEY) ----
async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || process.env.BUILT_IN_FORGE_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";

  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

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

// Kraken free public API — globally accessible, no auth, no rate-limiting
const KRAKEN_BASE = "https://api.kraken.com/0/public";

// Simple in-memory cache to avoid unnecessary API calls
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
  if (cached) {
    console.log(`[Cache HIT] ${cacheKey}`);
    return cached;
  }

  const res = await fetch(`${KRAKEN_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Kraken API error: ${res.status}`);
  }
  const json = await res.json();
  
  if (json.error && json.error.length > 0) {
    throw new Error(`Kraken API error: ${json.error[0]}`);
  }

  setCached(cacheKey, json.result, 10); // Cache for 10 seconds
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

  // Bitcoin data proxy — routes Kraken API calls through the server with caching
  btc: router({
    /**
     * Get 1-minute OHLCV candles for BTC/USD from Kraken
     * Used for chart display and prediction algorithm
     */
    klines: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(30) }))
      .query(async ({ input }) => {
        try {
          // Kraken returns: [time, open, high, low, close, vwap, volume, count]
          const result = await fetchKraken("/OHLC?pair=XBTUSD&interval=1") as Record<string, unknown[]>;
          const data = result.XXBTZUSD as [number, string, string, string, string, string, string, number][];
          
          if (!data || data.length === 0) {
            throw new Error("No OHLC data returned from Kraken");
          }

          // Take the most recent candles
          const recent = data.slice(-input.limit).map((candle) => [
            candle[0] * 1000, // Convert seconds to milliseconds
            candle[1], // open
            candle[2], // high
            candle[3], // low
            candle[4], // close
            candle[6], // volume
            "0",
          ]) as [number, string, string, string, string, string, string][];

          return recent;
        } catch (error) {
          console.error("[Kraken klines error]", error);
          throw error;
        }
      }),

    /**
     * Get 24-hour ticker statistics for BTC/USD
     * Used for the live price header
     */
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

    /**
     * Get recent candles for polling
     * Used for live updates every 10 seconds
     */
    recent: publicProcedure.query(async () => {
      try {
        const result = await fetchKraken("/OHLC?pair=XBTUSD&interval=1") as Record<string, unknown[]>;
        const data = result.XXBTZUSD as [number, string, string, string, string, string, string, number][];

        if (!data || data.length === 0) {
          throw new Error("No recent candles returned from Kraken");
        }

        // Return last 6 candles
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

    /**
     * AI-powered prediction using Gemini 2.5 Flash
     * Analyzes candle data + technical factors and returns structured prediction
     * Cached for 60 seconds to avoid excessive LLM calls
     */
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
        // Cache key based on window start to avoid repeated calls for same window
        const cacheKey = `ai_predict:${input.windowStart}`;
        const cached = getCached(cacheKey);
        if (cached) {
          console.log(`[Cache HIT] ${cacheKey}`);
          return cached as AIPredictionResult;
        }

        try {
          const { candles, factors, mathPrediction, mathConfidence, sessionAccuracy } = input;

          // Build a concise market summary for the AI
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

          setCached(cacheKey, parsed, 60); // Cache for 60 seconds (one window)
          return parsed;
        } catch (error) {
          console.error("[AI Predict error]", error);
          // Return a fallback response instead of throwing
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
  }),
});

export type AIPredictionResult = {
  prediction: "UP" | "DOWN" | "SKIP";
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  supportingSignals: string[];
  riskFactors: string[];
};

export type AppRouter = typeof appRouter;
