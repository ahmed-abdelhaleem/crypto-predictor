/**
 * useBitcoinData — Core hook for real-time BTC price data and 5-minute window prediction
 *
 * Enhanced features:
 * - Persists prediction windows to DB via tRPC
 * - Loads full history from DB on mount
 * - Uses ML-adjusted weights from server
 * - Supports mid-window prediction revisions
 * - Pattern enable/disable support
 */

import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
}

export interface AdvancedFactors {
  momentum: number;
  volumeDelta: number;
  priceVelocity: number;
  rsiScore: number;
  emaSignal: number;
  bollingerPos: number;
  vwapDeviation: number;
  bodyRatio: number;
  wickBias: number;
  trendStrength: number;
  rawScore: number;
  signalStrength: "STRONG" | "MODERATE" | "WEAK";
}

export interface FiveMinWindow {
  windowStart: number;
  windowEnd: number;
  candles: Candle[];
  prediction: "UP" | "DOWN" | "NEUTRAL" | null;
  predictionConfidence: number;
  predictionMadeAt: number | null;
  actualResult: "UP" | "DOWN" | null;
  predictionCorrect: boolean | null;
  analysisFactors: AdvancedFactors;
  openPrice: number;
  closePrice: number | null;
  priceChangePct: number | null;
  highPrice: number;
  lowPrice: number;
  totalVolume: number;
  streakType: "WIN" | "LOSS" | "NONE";
  dbId?: number;
  source?: string;
}

export interface LiveTicker {
  price: number;
  priceChange24h: number;
  priceChangePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdate: number;
}

export interface SessionStats {
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  currentStreak: number;
  currentStreakType: "WIN" | "LOSS" | "NONE";
  bestStreak: number;
  avgConfidence: number;
  upPredictions: number;
  downPredictions: number;
  upCorrect: number;
  downCorrect: number;
}

export interface UseBitcoinDataResult {
  candles: Candle[];
  currentWindow: FiveMinWindow | null;
  pastWindows: FiveMinWindow[];
  ticker: LiveTicker | null;
  isLoading: boolean;
  error: string | null;
  windowProgress: number;
  analysisProgress: number;
  isInAnalysisPhase: boolean;
  accuracy: number;
  sessionStats: SessionStats;
  dbHistoryTotal: number;
}

// ---- Advanced Technical Indicators ----

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
    const typicalPrice = (c.high + c.low + c.close) / 3;
    sumPV += typicalPrice * c.volume;
    sumV += c.volume;
  });
  return sumV > 0 ? sumPV / sumV : candles[candles.length - 1]?.close ?? 0;
}

function computeBollingerBands(closes: number[], period: number, stdDev = 2) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, position: 50 };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + stdDev * std;
  const lower = mean - stdDev * std;
  const current = closes[closes.length - 1];
  const range = upper - lower;
  const position = range > 0 ? ((current - lower) / range) * 100 : 50;
  return { upper, middle: mean, lower, position: Math.max(0, Math.min(100, position)) };
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
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// ---- Advanced Prediction Algorithm with configurable weights ----
export function computePrediction(
  candles: Candle[],
  weights?: Record<string, number>
): {
  prediction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  factors: AdvancedFactors;
} {
  const w = weights ?? {
    momentum: 0.25, volumeDelta: 0.20, priceVelocity: 0.15,
    rsiScore: 0.10, emaSignal: 0.10, bollingerPos: 0.08,
    vwapDeviation: 0.05, wickBias: 0.04, trendStrength: 0.03,
  };

  const emptyFactors: AdvancedFactors = {
    momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50,
    emaSignal: 0, bollingerPos: 50, vwapDeviation: 0,
    bodyRatio: 50, wickBias: 0, trendStrength: 50,
    rawScore: 0, signalStrength: "WEAK",
  };

  if (candles.length < 2) {
    return { prediction: "NEUTRAL", confidence: 0, factors: emptyFactors };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const closes = candles.map((c) => c.close);

  // 1. Momentum
  const priceChange = last.close - first.open;
  const priceChangePct = (priceChange / first.open) * 100;
  const momentum = Math.max(-100, Math.min(100, priceChangePct * 200));

  // 2. Volume delta
  let bullishVol = 0;
  let bearishVol = 0;
  candles.forEach((c) => {
    if (c.isBullish) bullishVol += c.volume;
    else bearishVol += c.volume;
  });
  const totalVol = bullishVol + bearishVol;
  const volumeDelta = totalVol > 0 ? ((bullishVol - bearishVol) / totalVol) * 100 : 0;

  // 3. Price velocity (acceleration)
  let velocity = 0;
  if (candles.length >= 3) {
    const mid = Math.floor(candles.length / 2);
    const firstHalfChange = candles[mid].close - candles[0].open;
    const secondHalfChange = last.close - candles[mid].open;
    velocity = Math.max(-100, Math.min(100, (secondHalfChange - firstHalfChange) / first.open * 5000));
  }

  // 4. RSI
  const rsiScore = computeRSI(candles, Math.min(3, candles.length - 1));

  // 5. EMA crossover
  const ema3 = computeEMA(closes, Math.min(3, closes.length));
  const ema5 = computeEMA(closes, Math.min(5, closes.length));
  const emaLast3 = ema3[ema3.length - 1] ?? last.close;
  const emaLast5 = ema5[ema5.length - 1] ?? last.close;
  const emaSignal = emaLast5 > 0
    ? Math.max(-100, Math.min(100, ((emaLast3 - emaLast5) / emaLast5) * 10000))
    : 0;

  // 6. Bollinger position
  const bb = computeBollingerBands(closes, Math.min(closes.length, 5));
  const bollingerPos = bb.position;

  // 7. VWAP deviation
  const vwap = computeVWAP(candles);
  const vwapDeviation = vwap > 0
    ? Math.max(-100, Math.min(100, ((last.close - vwap) / vwap) * 10000))
    : 0;

  // 8. Body/wick analysis
  let totalBodyRatio = 0;
  let totalWickBias = 0;
  candles.forEach((c) => {
    const range = c.high - c.low;
    if (range > 0) {
      const body = Math.abs(c.close - c.open);
      totalBodyRatio += (body / range) * 100;
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const wickRange = upperWick + lowerWick;
      if (wickRange > 0) {
        totalWickBias += ((lowerWick - upperWick) / wickRange) * 100;
      }
    }
  });
  const bodyRatio = totalBodyRatio / candles.length;
  const wickBias = totalWickBias / candles.length;

  // 9. Trend strength
  let streak = 0;
  const lastDir = candles[candles.length - 1].isBullish;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].isBullish === lastDir) streak++;
    else break;
  }
  const trendStrength = Math.min(100, (streak / candles.length) * 100 + (lastDir ? 20 : -20) + 50);

  // ---- Weighted Composite Score ----
  const score =
    momentum                 * (w.momentum     ?? 0.25) +
    volumeDelta              * (w.volumeDelta   ?? 0.20) +
    velocity                 * (w.priceVelocity ?? 0.15) +
    (rsiScore - 50) * 2      * (w.rsiScore      ?? 0.10) +
    emaSignal                * (w.emaSignal     ?? 0.10) +
    (bollingerPos - 50) * 2  * (w.bollingerPos  ?? 0.08) +
    vwapDeviation            * (w.vwapDeviation ?? 0.05) +
    wickBias                 * (w.wickBias      ?? 0.04) +
    (trendStrength - 50) * 2 * (w.trendStrength ?? 0.03);

  const absScore = Math.abs(score);
  const bodyBonus = (bodyRatio - 50) * 0.1;
  const confidence = Math.min(95, Math.max(5, 50 + absScore * 0.75 + bodyBonus));

  let prediction: "UP" | "DOWN" | "NEUTRAL";
  if (absScore < 4) prediction = "NEUTRAL";
  else if (score > 0) prediction = "UP";
  else prediction = "DOWN";

  const signalStrength: "STRONG" | "MODERATE" | "WEAK" =
    absScore >= 25 ? "STRONG" : absScore >= 10 ? "MODERATE" : "WEAK";

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
      bodyRatio: Math.round(bodyRatio),
      wickBias: Math.round(wickBias),
      trendStrength: Math.round(trendStrength),
      rawScore: Math.round(score * 10) / 10,
      signalStrength,
    },
  };
}

function getWindowStart(ts: number): number {
  return Math.floor(ts / (5 * 60 * 1000)) * (5 * 60 * 1000);
}

function parseRawCandle(raw: [number, string, string, string, string, string, ...unknown[]]): Candle {
  const o = parseFloat(raw[1]);
  const h = parseFloat(raw[2]);
  const l = parseFloat(raw[3]);
  const c = parseFloat(raw[4]);
  const v = parseFloat(raw[5]);
  return {
    time: raw[0],
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    isBullish: c >= o,
  };
}

function buildWindowFromCandles(
  windowStart: number,
  candles: Candle[],
  isFinalized: boolean,
  weights?: Record<string, number>
): FiveMinWindow {
  const windowEnd = windowStart + 5 * 60 * 1000;
  const openPrice = candles[0]?.open ?? 0;
  const closePrice = isFinalized ? (candles[candles.length - 1]?.close ?? null) : null;
  const highPrice = candles.reduce((m, c) => Math.max(m, c.high), openPrice);
  const lowPrice = candles.reduce((m, c) => Math.min(m, c.low), openPrice);
  const totalVolume = candles.reduce((s, c) => s + c.volume, 0);

  const analysisCandles = candles.slice(0, 3);
  const { prediction, confidence, factors } =
    analysisCandles.length >= 2
      ? computePrediction(analysisCandles, weights)
      : { prediction: "NEUTRAL" as const, confidence: 0, factors: {
          momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50,
          emaSignal: 0, bollingerPos: 50, vwapDeviation: 0,
          bodyRatio: 50, wickBias: 0, trendStrength: 50,
          rawScore: 0, signalStrength: "WEAK" as const,
        }};

  let actualResult: "UP" | "DOWN" | null = null;
  let predictionCorrect: boolean | null = null;
  let priceChangePct: number | null = null;

  if (isFinalized && closePrice !== null) {
    priceChangePct = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;
    actualResult = closePrice >= openPrice ? "UP" : "DOWN";
    predictionCorrect = prediction !== "NEUTRAL" ? prediction === actualResult : null;
  }

  return {
    windowStart,
    windowEnd,
    candles,
    prediction,
    predictionConfidence: confidence,
    predictionMadeAt: windowStart + 3 * 60 * 1000,
    actualResult,
    predictionCorrect,
    analysisFactors: factors,
    openPrice,
    closePrice,
    priceChangePct,
    highPrice,
    lowPrice,
    totalVolume,
    streakType: "NONE",
  };
}

function computeSessionStats(windows: FiveMinWindow[]): SessionStats {
  const decided = windows.filter((w) => w.predictionCorrect !== null);
  const correct = decided.filter((w) => w.predictionCorrect === true);
  const totalPredictions = decided.length;
  const correctPredictions = correct.length;
  const accuracy = totalPredictions > 0 ? Math.round((correctPredictions / totalPredictions) * 100) : 0;

  let currentStreak = 0;
  let currentStreakType: "WIN" | "LOSS" | "NONE" = "NONE";
  let bestStreak = 0;
  let tempStreak = 0;
  let lastType: boolean | null = null;

  for (let i = 0; i < decided.length; i++) {
    const isWin = decided[i].predictionCorrect === true;
    if (lastType === null || lastType === isWin) {
      tempStreak++;
      lastType = isWin;
    } else {
      tempStreak = 1;
      lastType = isWin;
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
    if (i === decided.length - 1) {
      currentStreak = tempStreak;
      currentStreakType = isWin ? "WIN" : "LOSS";
    }
  }

  const withConf = windows.filter((w) => w.predictionConfidence > 0);
  const avgConfidence = withConf.length > 0
    ? Math.round(withConf.reduce((s, w) => s + w.predictionConfidence, 0) / withConf.length)
    : 0;

  const upPredictions = windows.filter((w) => w.prediction === "UP").length;
  const downPredictions = windows.filter((w) => w.prediction === "DOWN").length;
  const upCorrect = windows.filter((w) => w.prediction === "UP" && w.predictionCorrect === true).length;
  const downCorrect = windows.filter((w) => w.prediction === "DOWN" && w.predictionCorrect === true).length;

  return {
    totalPredictions,
    correctPredictions,
    accuracy,
    currentStreak,
    currentStreakType,
    bestStreak,
    avgConfidence,
    upPredictions,
    downPredictions,
    upCorrect,
    downCorrect,
  };
}

// Convert DB window to FiveMinWindow
function dbWindowToFiveMin(dbWin: {
  windowStart: number;
  windowEnd: number;
  prediction?: string | null;
  predictionConfidence?: number | null;
  predictionMadeAt?: number | null;
  actualResult?: string | null;
  predictionCorrect?: boolean | null;
  openPrice?: number | null;
  closePrice?: number | null;
  priceChangePct?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  totalVolume?: number | null;
  analysisFactors?: unknown;
  id?: number;
  source?: string | null;
}): FiveMinWindow {
  const factors = (dbWin.analysisFactors as AdvancedFactors | null) ?? {
    momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50,
    emaSignal: 0, bollingerPos: 50, vwapDeviation: 0,
    bodyRatio: 50, wickBias: 0, trendStrength: 50,
    rawScore: 0, signalStrength: "WEAK" as const,
  };

  return {
    windowStart: dbWin.windowStart,
    windowEnd: dbWin.windowEnd,
    candles: [],
    prediction: (dbWin.prediction as "UP" | "DOWN" | "NEUTRAL" | null) ?? null,
    predictionConfidence: dbWin.predictionConfidence ?? 0,
    predictionMadeAt: dbWin.predictionMadeAt ?? null,
    actualResult: (dbWin.actualResult as "UP" | "DOWN" | null) ?? null,
    predictionCorrect: dbWin.predictionCorrect ?? null,
    analysisFactors: factors,
    openPrice: dbWin.openPrice ?? 0,
    closePrice: dbWin.closePrice ?? null,
    priceChangePct: dbWin.priceChangePct ?? null,
    highPrice: dbWin.highPrice ?? 0,
    lowPrice: dbWin.lowPrice ?? 0,
    totalVolume: dbWin.totalVolume ?? 0,
    streakType: "NONE",
    dbId: dbWin.id,
    source: dbWin.source ?? "browser",
  };
}

export function useBitcoinData(): UseBitcoinDataResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentWindow, setCurrentWindow] = useState<FiveMinWindow | null>(null);
  const [pastWindows, setPastWindows] = useState<FiveMinWindow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [initialized, setInitialized] = useState(false);
  const [dbHistoryTotal, setDbHistoryTotal] = useState(0);

  const currentWindowRef = useRef<FiveMinWindow | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const savedWindowsRef = useRef<Set<number>>(new Set());
  const finalizedWindowsRef = useRef<Set<number>>(new Set());

  // tRPC queries
  const klinesQuery = trpc.btc.klines.useQuery({ limit: 60 }, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const tickerQuery = trpc.btc.ticker.useQuery(undefined, {
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const recentQuery = trpc.btc.recent.useQuery(undefined, {
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: initialized,
  });

  // Load history from DB
  const historyQuery = trpc.history.list.useQuery(
    { limit: 100, offset: 0 },
    { staleTime: 30000, refetchInterval: 60000 }
  );

  // tRPC mutations for persistence
  const saveWindowMutation = trpc.history.save.useMutation();
  const finalizeWindowMutation = trpc.history.finalize.useMutation();

  // Update candles ref
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  // Load DB history into pastWindows
  useEffect(() => {
    if (!historyQuery.data) return;
    const { windows, total } = historyQuery.data;
    setDbHistoryTotal(total);

    if (windows.length > 0) {
      const dbWindows = windows.map(dbWindowToFiveMin);
      setPastWindows((prev) => {
        // Merge: DB windows + in-memory windows, deduplicate by windowStart
        const merged = new Map<number, FiveMinWindow>();
        dbWindows.forEach((w) => merged.set(w.windowStart, w));
        // In-memory takes priority for current session
        prev.forEach((w) => {
          if (w.actualResult !== null || !merged.has(w.windowStart)) {
            merged.set(w.windowStart, w);
          }
        });
        return Array.from(merged.values())
          .sort((a, b) => b.windowStart - a.windowStart)
          .slice(0, 100);
      });
    }
  }, [historyQuery.data]);

  // Initialize from klines
  useEffect(() => {
    if (!klinesQuery.data || initialized) return;

    const rawCandles = klinesQuery.data as [number, string, string, string, string, string, ...unknown[]][];
    const parsed = rawCandles.map(parseRawCandle);
    setCandles(parsed);
    candlesRef.current = parsed;

    const nowTs = Date.now();
    const currentWS = getWindowStart(nowTs);
    const currentCandles = parsed.filter(
      (c) => c.time >= currentWS && c.time < currentWS + 5 * 60 * 1000
    );

    const elapsed = nowTs - currentWS;
    const shouldPredict = elapsed >= 3 * 60 * 1000 || currentCandles.length >= 3;

    let cw: FiveMinWindow;
    if (shouldPredict && currentCandles.length >= 2) {
      const analysisCandles = currentCandles.slice(0, 3);
      const { prediction, confidence, factors } = computePrediction(analysisCandles);
      const openPrice = currentCandles[0]?.open ?? 0;
      cw = {
        windowStart: currentWS,
        windowEnd: currentWS + 5 * 60 * 1000,
        candles: currentCandles,
        prediction,
        predictionConfidence: confidence,
        predictionMadeAt: currentWS + 3 * 60 * 1000,
        actualResult: null,
        predictionCorrect: null,
        analysisFactors: factors,
        openPrice,
        closePrice: null,
        priceChangePct: null,
        highPrice: currentCandles.reduce((m, c) => Math.max(m, c.high), openPrice),
        lowPrice: currentCandles.reduce((m, c) => Math.min(m, c.low), openPrice),
        totalVolume: currentCandles.reduce((s, c) => s + c.volume, 0),
        streakType: "NONE",
      };
    } else {
      const openPrice = currentCandles[0]?.open ?? 0;
      cw = {
        windowStart: currentWS,
        windowEnd: currentWS + 5 * 60 * 1000,
        candles: currentCandles,
        prediction: null,
        predictionConfidence: 0,
        predictionMadeAt: null,
        actualResult: null,
        predictionCorrect: null,
        analysisFactors: {
          momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50,
          emaSignal: 0, bollingerPos: 50, vwapDeviation: 0,
          bodyRatio: 50, wickBias: 0, trendStrength: 50,
          rawScore: 0, signalStrength: "WEAK",
        },
        openPrice,
        closePrice: null,
        priceChangePct: null,
        highPrice: openPrice,
        lowPrice: openPrice,
        totalVolume: 0,
        streakType: "NONE",
      };
    }
    setCurrentWindow(cw);
    currentWindowRef.current = cw;
    setInitialized(true);
  }, [klinesQuery.data, initialized]);

  // Save window to DB when prediction is made
  useEffect(() => {
    const cw = currentWindow;
    if (!cw || !cw.prediction || savedWindowsRef.current.has(cw.windowStart)) return;

    savedWindowsRef.current.add(cw.windowStart);
    saveWindowMutation.mutate({
      windowStart: cw.windowStart,
      windowEnd: cw.windowEnd,
      prediction: cw.prediction,
      predictionConfidence: cw.predictionConfidence,
      predictionMadeAt: cw.predictionMadeAt,
      openPrice: cw.openPrice,
      highPrice: cw.highPrice,
      lowPrice: cw.lowPrice,
      totalVolume: cw.totalVolume,
      analysisFactors: cw.analysisFactors as unknown as Record<string, unknown>,
      source: "browser",
    });
  }, [currentWindow?.prediction, currentWindow?.windowStart]);

  // Process recent candle updates
  const processRecentCandles = useCallback((newRaw: [number, string, string, string, string, string, ...unknown[]][]) => {
    const newCandles = newRaw.map(parseRawCandle);

    setCandles((prev) => {
      const merged = [...prev];
      newCandles.forEach((nc) => {
        const idx = merged.findIndex((c) => c.time === nc.time);
        if (idx >= 0) merged[idx] = nc;
        else merged.push(nc);
      });
      return merged.sort((a, b) => a.time - b.time).slice(-60);
    });

    const nowTs = Date.now();
    const currentWS = getWindowStart(nowTs);
    const cw = currentWindowRef.current;

    if (cw && cw.windowStart !== currentWS) {
      // Window rolled over — finalize previous window
      const prevCandles = candlesRef.current.filter(
        (c) => c.time >= cw.windowStart && c.time < cw.windowStart + 5 * 60 * 1000
      );
      if (prevCandles.length > 0) {
        const sorted = prevCandles.sort((a, b) => a.time - b.time);
        const finalizedWindow = buildWindowFromCandles(cw.windowStart, sorted, true);

        // Persist finalization to DB
        if (!finalizedWindowsRef.current.has(cw.windowStart)) {
          finalizedWindowsRef.current.add(cw.windowStart);
          if (finalizedWindow.closePrice !== null && finalizedWindow.actualResult !== null) {
            finalizeWindowMutation.mutate({
              windowStart: cw.windowStart,
              closePrice: finalizedWindow.closePrice,
              actualResult: finalizedWindow.actualResult,
              predictionCorrect: finalizedWindow.predictionCorrect,
              priceChangePct: finalizedWindow.priceChangePct ?? 0,
              highPrice: finalizedWindow.highPrice,
              lowPrice: finalizedWindow.lowPrice,
              totalVolume: finalizedWindow.totalVolume,
            });
          }
        }

        setPastWindows((prev) => {
          const updated = [finalizedWindow, ...prev.filter((w) => w.windowStart !== cw.windowStart)].slice(0, 100);
          return updated;
        });
      }

      const freshCandles = newCandles.filter(
        (c) => c.time >= currentWS && c.time < currentWS + 5 * 60 * 1000
      );
      const openPrice = freshCandles[0]?.open ?? 0;
      const newCW: FiveMinWindow = {
        windowStart: currentWS,
        windowEnd: currentWS + 5 * 60 * 1000,
        candles: freshCandles,
        prediction: null,
        predictionConfidence: 0,
        predictionMadeAt: null,
        actualResult: null,
        predictionCorrect: null,
        analysisFactors: {
          momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50,
          emaSignal: 0, bollingerPos: 50, vwapDeviation: 0,
          bodyRatio: 50, wickBias: 0, trendStrength: 50,
          rawScore: 0, signalStrength: "WEAK",
        },
        openPrice,
        closePrice: null,
        priceChangePct: null,
        highPrice: openPrice,
        lowPrice: openPrice,
        totalVolume: 0,
        streakType: "NONE",
      };
      setCurrentWindow(newCW);
      currentWindowRef.current = newCW;
      return;
    }

    if (cw) {
      const windowCandles = newCandles.filter(
        (c) => c.time >= cw.windowStart && c.time < cw.windowEnd
      );
      const allWindowCandles = [...cw.candles];
      windowCandles.forEach((nc) => {
        const idx = allWindowCandles.findIndex((c) => c.time === nc.time);
        if (idx >= 0) allWindowCandles[idx] = nc;
        else allWindowCandles.push(nc);
      });

      const sortedWindow = allWindowCandles.sort((a, b) => a.time - b.time);
      const elapsed = nowTs - cw.windowStart;
      const analysisCandles = sortedWindow.slice(0, 3);
      const shouldPredict = elapsed >= 3 * 60 * 1000 || analysisCandles.length >= 3;

      const openPrice = sortedWindow[0]?.open ?? cw.openPrice;
      const highPrice = sortedWindow.reduce((m, c) => Math.max(m, c.high), openPrice);
      const lowPrice = sortedWindow.reduce((m, c) => Math.min(m, c.low), openPrice);
      const totalVolume = sortedWindow.reduce((s, c) => s + c.volume, 0);

      if (shouldPredict && !cw.prediction && analysisCandles.length > 0) {
        const { prediction, confidence, factors } = computePrediction(analysisCandles);
        const updated: FiveMinWindow = {
          ...cw,
          candles: sortedWindow,
          prediction,
          predictionConfidence: confidence,
          predictionMadeAt: Date.now(),
          analysisFactors: factors,
          openPrice,
          highPrice,
          lowPrice,
          totalVolume,
        };
        setCurrentWindow(updated);
        currentWindowRef.current = updated;
      } else {
        const updated: FiveMinWindow = {
          ...cw,
          candles: sortedWindow,
          openPrice,
          highPrice,
          lowPrice,
          totalVolume,
        };
        setCurrentWindow(updated);
        currentWindowRef.current = updated;
      }
    }
  }, []);

  // Handle recent candle updates
  useEffect(() => {
    if (!recentQuery.data || !initialized) return;
    processRecentCandles(recentQuery.data);
  }, [recentQuery.data, initialized, processRecentCandles]);

  // Clock tick
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Derived values
  const windowProgress = currentWindow
    ? Math.min(100, ((now - currentWindow.windowStart) / (5 * 60 * 1000)) * 100)
    : 0;

  const analysisProgress = currentWindow
    ? Math.min(100, ((now - currentWindow.windowStart) / (3 * 60 * 1000)) * 100)
    : 0;

  const isInAnalysisPhase = currentWindow
    ? now < currentWindow.windowStart + 3 * 60 * 1000
    : false;

  const decidedWindows = pastWindows.filter((w) => w.predictionCorrect !== null);
  const correctWindows = decidedWindows.filter((w) => w.predictionCorrect === true);
  const accuracy = decidedWindows.length > 0
    ? Math.round((correctWindows.length / decidedWindows.length) * 100)
    : 0;

  const sessionStats = computeSessionStats(pastWindows);

  const isLoading = klinesQuery.isLoading && !initialized;
  const error = klinesQuery.error?.message || tickerQuery.error?.message || null;

  return {
    candles,
    currentWindow,
    pastWindows,
    ticker: tickerQuery.data ?? null,
    isLoading,
    error,
    windowProgress,
    analysisProgress,
    isInAnalysisPhase,
    accuracy,
    sessionStats,
    dbHistoryTotal,
  };
}
