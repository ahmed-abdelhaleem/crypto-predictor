/**
 * useBitcoinData — Core hook for real-time BTC price data and 5-minute window prediction
 *
 * Strategy:
 * - Fetches 1-minute OHLCV candles via tRPC backend proxy (avoids geo-restrictions)
 * - Groups candles into 5-minute windows
 * - Analyzes the first 3 minutes of each window to predict UP/DOWN by end of window
 * - Prediction algorithm uses: EMA crossover, Bollinger Bands, VWAP deviation,
 *   momentum, RSI, volume delta, price velocity, candle body/wick analysis
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
  // Original factors
  momentum: number;
  volumeDelta: number;
  priceVelocity: number;
  rsiScore: number;
  // New advanced factors
  emaSignal: number;       // EMA3 vs EMA5 crossover signal (-100 to 100)
  bollingerPos: number;    // Position within Bollinger Bands (0-100, 50=mid)
  vwapDeviation: number;   // % deviation from VWAP (-100 to 100)
  bodyRatio: number;       // Candle body/range ratio (0-100, higher = stronger)
  wickBias: number;        // Upper vs lower wick bias (-100 to 100)
  trendStrength: number;   // Consecutive same-direction candles (0-100)
  // Composite
  rawScore: number;        // Weighted composite before normalization
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
  // Price stats
  openPrice: number;
  closePrice: number | null;
  priceChangePct: number | null;
  highPrice: number;
  lowPrice: number;
  totalVolume: number;
  // Streak info
  streakType: "WIN" | "LOSS" | "NONE";
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

// ---- Advanced Prediction Algorithm ----
export function computePrediction(candles: Candle[]): {
  prediction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  factors: AdvancedFactors;
} {
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

  // 1. Momentum: net price change over analysis window
  const priceChange = last.close - first.open;
  const priceChangePct = (priceChange / first.open) * 100;
  const momentum = Math.max(-100, Math.min(100, priceChangePct * 200));

  // 2. Volume delta: buy vs sell pressure
  let bullishVol = 0;
  let bearishVol = 0;
  candles.forEach((c) => {
    if (c.isBullish) bullishVol += c.volume;
    else bearishVol += c.volume;
  });
  const totalVol = bullishVol + bearishVol;
  const volumeDelta = totalVol > 0 ? ((bullishVol - bearishVol) / totalVol) * 100 : 0;

  // 3. Price velocity: acceleration (second derivative)
  let velocity = 0;
  if (candles.length >= 3) {
    const mid = Math.floor(candles.length / 2);
    const firstHalfChange = candles[mid].close - candles[0].open;
    const secondHalfChange = last.close - candles[mid].open;
    velocity = Math.max(-100, Math.min(100, (secondHalfChange - firstHalfChange) / first.open * 5000));
  }

  // 4. RSI (proper calculation)
  const rsiScore = computeRSI(candles, Math.min(3, candles.length - 1));

  // 5. EMA crossover signal
  const ema3 = computeEMA(closes, Math.min(3, closes.length));
  const ema5 = computeEMA(closes, Math.min(5, closes.length));
  const emaLast3 = ema3[ema3.length - 1] ?? last.close;
  const emaLast5 = ema5[ema5.length - 1] ?? last.close;
  const emaSignal = emaLast5 > 0
    ? Math.max(-100, Math.min(100, ((emaLast3 - emaLast5) / emaLast5) * 10000))
    : 0;

  // 6. Bollinger Band position
  const bb = computeBollingerBands(closes, Math.min(closes.length, 5));
  const bollingerPos = bb.position; // 0=at lower band, 100=at upper band

  // 7. VWAP deviation
  const vwap = computeVWAP(candles);
  const vwapDeviation = vwap > 0
    ? Math.max(-100, Math.min(100, ((last.close - vwap) / vwap) * 10000))
    : 0;

  // 8. Candle body/wick analysis
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
        // Positive = more lower wick (bullish rejection), negative = more upper wick (bearish rejection)
        totalWickBias += ((lowerWick - upperWick) / wickRange) * 100;
      }
    }
  });
  const bodyRatio = totalBodyRatio / candles.length;
  const wickBias = totalWickBias / candles.length;

  // 9. Trend strength: consecutive same-direction candles
  let streak = 0;
  const lastDir = candles[candles.length - 1].isBullish;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].isBullish === lastDir) streak++;
    else break;
  }
  const trendStrength = Math.min(100, (streak / candles.length) * 100 + (lastDir ? 20 : -20) + 50);

  // ---- Weighted Composite Score ----
  // Weights tuned for 5-min BTC binary prediction
  const score =
    momentum       * 0.25 +
    volumeDelta    * 0.20 +
    velocity       * 0.15 +
    (rsiScore - 50) * 2 * 0.10 +
    emaSignal      * 0.10 +
    (bollingerPos - 50) * 2 * 0.08 +
    vwapDeviation  * 0.05 +
    wickBias       * 0.04 +
    (trendStrength - 50) * 2 * 0.03;

  const absScore = Math.abs(score);

  // Confidence: calibrated to historical accuracy range
  // Base 50%, scale by signal strength, cap at 95%
  const bodyBonus = (bodyRatio - 50) * 0.1; // Strong candle bodies add confidence
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
  return { time: raw[0], open: o, high: h, low: l, close: c, volume: v, isBullish: c >= o };
}

function buildWindowFromCandles(
  ws: number,
  sortedCandles: Candle[],
  isCompleted: boolean
): FiveMinWindow {
  const openPrice = sortedCandles[0]?.open ?? 0;
  const closePrice = isCompleted ? sortedCandles[sortedCandles.length - 1]?.close ?? null : null;
  const highPrice = sortedCandles.reduce((m, c) => Math.max(m, c.high), 0);
  const lowPrice = sortedCandles.reduce((m, c) => Math.min(m, c.low), Infinity);
  const totalVolume = sortedCandles.reduce((s, c) => s + c.volume, 0);
  const priceChangePct = isCompleted && openPrice > 0 && closePrice !== null
    ? ((closePrice - openPrice) / openPrice) * 100
    : null;

  const analysisCandles = sortedCandles.slice(0, 3);
  const { prediction, confidence, factors } = computePrediction(analysisCandles);
  const actualResult: "UP" | "DOWN" | null = isCompleted && closePrice !== null
    ? (closePrice >= openPrice ? "UP" : "DOWN")
    : null;
  const predictionCorrect = isCompleted && prediction !== "NEUTRAL" && actualResult !== null
    ? prediction === actualResult
    : null;

  return {
    windowStart: ws,
    windowEnd: ws + 5 * 60 * 1000,
    candles: sortedCandles,
    prediction,
    predictionConfidence: confidence,
    predictionMadeAt: ws + 3 * 60 * 1000,
    actualResult,
    predictionCorrect,
    analysisFactors: factors,
    openPrice,
    closePrice,
    priceChangePct,
    highPrice: highPrice === 0 ? openPrice : highPrice,
    lowPrice: lowPrice === Infinity ? openPrice : lowPrice,
    totalVolume,
    streakType: "NONE",
  };
}

function computeSessionStats(pastWindows: FiveMinWindow[]): SessionStats {
  const decided = pastWindows.filter((w) => w.predictionCorrect !== null);
  const correct = decided.filter((w) => w.predictionCorrect === true);
  const accuracy = decided.length > 0 ? Math.round((correct.length / decided.length) * 100) : 0;

  // Current streak
  let currentStreak = 0;
  let currentStreakType: "WIN" | "LOSS" | "NONE" = "NONE";
  for (const w of decided) {
    if (currentStreakType === "NONE") {
      currentStreakType = w.predictionCorrect ? "WIN" : "LOSS";
      currentStreak = 1;
    } else if ((currentStreakType === "WIN") === w.predictionCorrect) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Best streak
  let bestStreak = 0;
  let tempStreak = 0;
  let tempType: boolean | null = null;
  for (const w of [...decided].reverse()) {
    if (tempType === null || tempType === w.predictionCorrect) {
      tempStreak++;
      tempType = w.predictionCorrect;
    } else {
      bestStreak = Math.max(bestStreak, tempStreak);
      tempStreak = 1;
      tempType = w.predictionCorrect;
    }
  }
  bestStreak = Math.max(bestStreak, tempStreak);

  const avgConfidence = decided.length > 0
    ? Math.round(decided.reduce((s, w) => s + w.predictionConfidence, 0) / decided.length)
    : 0;

  const upPredictions = decided.filter((w) => w.prediction === "UP").length;
  const downPredictions = decided.filter((w) => w.prediction === "DOWN").length;
  const upCorrect = decided.filter((w) => w.prediction === "UP" && w.predictionCorrect).length;
  const downCorrect = decided.filter((w) => w.prediction === "DOWN" && w.predictionCorrect).length;

  return {
    totalPredictions: decided.length,
    correctPredictions: correct.length,
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

// ---- Main hook ----
export function useBitcoinData(): UseBitcoinDataResult {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentWindow, setCurrentWindow] = useState<FiveMinWindow | null>(null);
  const [pastWindows, setPastWindows] = useState<FiveMinWindow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [initialized, setInitialized] = useState(false);

  const candlesRef = useRef<Candle[]>([]);
  const currentWindowRef = useRef<FiveMinWindow | null>(null);
  const pastWindowsRef = useRef<FiveMinWindow[]>([]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { currentWindowRef.current = currentWindow; }, [currentWindow]);
  useEffect(() => { pastWindowsRef.current = pastWindows; }, [pastWindows]);

  // tRPC queries
  const klinesQuery = trpc.btc.klines.useQuery(
    { limit: 30 },
    { refetchOnWindowFocus: false, retry: 3 }
  );

  const tickerQuery = trpc.btc.ticker.useQuery(undefined, {
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  const recentQuery = trpc.btc.recent.useQuery(undefined, {
    refetchInterval: 10000,
    refetchOnWindowFocus: false,
    retry: 3,
    enabled: initialized,
  });

  // Process initial candles
  useEffect(() => {
    if (!klinesQuery.data || initialized) return;

    const parsed = klinesQuery.data.map(parseRawCandle);
    setCandles(parsed);
    candlesRef.current = parsed;

    const nowTs = Date.now();
    const currentWS = getWindowStart(nowTs);
    const windowMap = new Map<number, Candle[]>();

    parsed.forEach((c) => {
      const ws = getWindowStart(c.time);
      if (!windowMap.has(ws)) windowMap.set(ws, []);
      windowMap.get(ws)!.push(c);
    });

    const pastWs: FiveMinWindow[] = [];
    windowMap.forEach((wCandles, ws) => {
      if (ws === currentWS) return;
      const sorted = wCandles.sort((a, b) => a.time - b.time);
      pastWs.push(buildWindowFromCandles(ws, sorted, true));
    });

    const sortedPast = pastWs.sort((a, b) => b.windowStart - a.windowStart).slice(0, 20);

    // Annotate streak types
    for (let i = 0; i < sortedPast.length; i++) {
      const w = sortedPast[i];
      if (w.predictionCorrect === true) sortedPast[i] = { ...w, streakType: "WIN" };
      else if (w.predictionCorrect === false) sortedPast[i] = { ...w, streakType: "LOSS" };
    }

    setPastWindows(sortedPast);
    pastWindowsRef.current = sortedPast;

    // Build current window
    const currentCandles = (windowMap.get(currentWS) || []).sort((a, b) => a.time - b.time);
    const elapsed = nowTs - currentWS;
    const analysisCandles = currentCandles.slice(0, 3);
    const hasPrediction = elapsed >= 3 * 60 * 1000 || analysisCandles.length >= 3;

    let cw: FiveMinWindow;
    if (hasPrediction && analysisCandles.length > 0) {
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
        setPastWindows((prev) => {
          const updated = [finalizedWindow, ...prev].slice(0, 20);
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
  };
}
