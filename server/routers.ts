import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

// Bybit API base URL (no geo-restrictions, 1-minute candles available)
const BYBIT_BASE = "https://api.bybit.com/v5/market";
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

async function fetchBybit(path: string): Promise<unknown> {
  const res = await fetch(`${BYBIT_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Bybit API error: ${res.status}`);
  return res.json();
}

async function fetchCoinGecko(path: string): Promise<unknown> {
  const res = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  return res.json();
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

  // Bitcoin data proxy — routes Bybit API calls through the server (no geo-restrictions)
  btc: router({
    /**
     * Get 1-minute OHLCV candles for BTC/USDT from Bybit
     * Used for chart display and prediction algorithm
     */
    klines: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(30) }))
      .query(async ({ input }) => {
        const data = await fetchBybit(
          `/kline?category=spot&symbol=BTCUSDT&interval=1&limit=${input.limit}`
        ) as { result: { list: [string, string, string, string, string, string, string][] } };
        
        // Transform Bybit format to match Binance format for compatibility
        return data.result.list.map((candle) => [
          parseInt(candle[0]),
          candle[1],
          candle[2],
          candle[3],
          candle[4],
          candle[5],
          "0", // placeholder for close time
        ]) as [number, string, string, string, string, string, string][];
      }),

    /**
     * Get 24-hour ticker statistics for BTC/USDT
     * Used for the live price header
     */
    ticker: publicProcedure.query(async () => {
      const data = await fetchCoinGecko(
        "/simple/price?ids=bitcoin&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true"
      ) as { bitcoin: { usd: number; usd_24h_change: number; usd_market_cap: number; usd_24h_vol: number } };
      
      const btc = data.bitcoin;
      // Fetch additional high/low data from Bybit ticker
      const tickerData = await fetchBybit(
        "/tickers?category=spot&symbol=BTCUSDT"
      ) as { result: { list: [{ lastPrice: string; highPrice24h: string; lowPrice24h: string }] } };
      
      const ticker = tickerData.result.list[0];
      const price = parseFloat(ticker.lastPrice);
      const change24h = (btc.usd_24h_change / 100) * price;
      
      return {
        price,
        priceChange24h: change24h,
        priceChangePct24h: btc.usd_24h_change,
        high24h: parseFloat(ticker.highPrice24h),
        low24h: parseFloat(ticker.lowPrice24h),
        volume24h: btc.usd_24h_vol,
        lastUpdate: Date.now(),
      };
    }),

    /**
     * Get recent candles for polling (last 6 candles)
     * Used for live updates every 10 seconds
     */
    recent: publicProcedure.query(async () => {
      const data = await fetchBybit(
        "/kline?category=spot&symbol=BTCUSDT&interval=1&limit=6"
      ) as { result: { list: [string, string, string, string, string, string, string][] } };
      
      return data.result.list.map((candle) => [
        parseInt(candle[0]),
        candle[1],
        candle[2],
        candle[3],
        candle[4],
        candle[5],
        "0",
      ]) as [number, string, string, string, string, string, string][];
    }),
  }),
});

export type AppRouter = typeof appRouter;
