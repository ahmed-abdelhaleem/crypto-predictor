import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

// Binance API base URL
const BINANCE_BASE = "https://api.binance.com/api/v3";

async function fetchBinance(path: string): Promise<unknown> {
  const res = await fetch(`${BINANCE_BASE}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  return res.json();
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Bitcoin data proxy — routes Binance API calls through the server
  btc: router({
    klines: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(30) }))
      .query(async ({ input }) => {
        const data = await fetchBinance(
          `/klines?symbol=BTCUSDT&interval=1m&limit=${input.limit}`
        );
        return data as [number, string, string, string, string, string, ...unknown[]][];
      }),
    ticker: publicProcedure.query(async () => {
      const data = await fetchBinance("/ticker/24hr?symbol=BTCUSDT") as Record<string, string>;
      return {
        price: parseFloat(data.lastPrice),
        priceChange24h: parseFloat(data.priceChange),
        priceChangePct24h: parseFloat(data.priceChangePercent),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.volume),
        lastUpdate: Date.now(),
      };
    }),
    recent: publicProcedure.query(async () => {
      const data = await fetchBinance("/klines?symbol=BTCUSDT&interval=1m&limit=6");
      return data as [number, string, string, string, string, string, ...unknown[]][];
    }),
  }),
});

export type AppRouter = typeof appRouter;
