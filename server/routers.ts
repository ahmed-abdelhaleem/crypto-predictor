import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

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

        // Kraken format: a=[ask, askwhole, asklot], b=[bid, bidwhole, bidlot], c=[last, volume], v=[today, 24h], p=[today, 24h], t=[today, 24h], l=[today, 24h], h=[today, 24h], o=[today, 24h]
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
  }),
});

export type AppRouter = typeof appRouter;
