/**
 * useBitcoinData — Core hook for real-time BTC price data and 5-minute window prediction
 *
 * Strategy:
 * - Fetches 1-minute OHLCV candles via tRPC backend proxy (avoids geo-restrictions)
 * - Groups candles into 5-minute windows
 * - Analyzes the first 3 minutes of each window to predict UP/DOWN by end of window
 * - Prediction algorithm uses: momentum, RSI-like score, volume delta, price velocity
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

export interface FiveMinWindow {
  windowStart: number;
  windowEnd: number;
  candles: Candle[];
  prediction: "UP" | "DOWN" | "NEUTRAL" | null;
  predictionConfidence: number;
  predictionMadeAt: number | null;
  actualResult: "UP" | "DOWN" | null;
  predictionCorrect: boolean | null;
  analysisFactors: {
    momentum: number;
    volumeDelta: number;
    priceVelocity: number;
    rsiScore: number;
  };
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
}

// ---- Prediction Algorithm ----
function computePrediction(candles: Candle[]): {
  prediction: "UP" | "DOWN" | "NEUTRAL";
  confidence: number;
  factors: FiveMinWindow["analysisFactors"];
} {
  if (candles.length < 2) {
    return {
      prediction: "NEUTRAL",
      confidence: 0,
      factors: { momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50 },
    };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];

  // 1. Momentum: net price change over analysis window
  const priceChange = last.close - first.open;
  const priceChangePct = (priceChange / first.open) * 100;
  const momentum = Math.max(-100, Math.min(100, priceChangePct * 200));

  // 2. Volume delta: compare buy vs sell pressure
  let bullishVol = 0;
  let bearishVol = 0;
  candles.forEach((c) => {
    if (c.isBullish) bullishVol += c.volume;
    else bearishVol += c.volume;
  });
  const totalVol = bullishVol + bearishVol;
  const volumeDelta = totalVol > 0 ? ((bullishVol - bearishVol) / totalVol) * 100 : 0;

  // 3. Price velocity: acceleration
  let velocity = 0;
  if (candles.length >= 3) {
    const mid = Math.floor(candles.length / 2);
    const firstHalfChange = candles[mid].close - candles[0].open;
    const secondHalfChange = last.close - candles[mid].open;
    velocity = Math.max(-100, Math.min(100, (secondHalfChange - firstHalfChange) / first.open * 5000));
  }

  // 4. RSI-like score
  const upCloses = candles.filter((c) => c.isBullish).length;
  const rsiScore = (upCloses / candles.length) * 100;

  // Weighted composite score
  const score =
    momentum * 0.35 +
    volumeDelta * 0.30 +
    velocity * 0.20 +
    (rsiScore - 50) * 2 * 0.15;

  const absScore = Math.abs(score);
  const confidence = Math.min(95, Math.max(5, 50 + absScore * 0.8));

  let prediction: "UP" | "DOWN" | "NEUTRAL";
  if (absScore < 3) prediction = "NEUTRAL";
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
      const openPrice = sorted[0].open;
      const closePrice = sorted[sorted.length - 1].close;
      const analysisCandles = sorted.slice(0, 3);
      const { prediction, confidence, factors } = computePrediction(analysisCandles);
      const actualResult = closePrice >= openPrice ? "UP" : "DOWN";
      pastWs.push({
        windowStart: ws,
        windowEnd: ws + 5 * 60 * 1000,
        candles: sorted,
        prediction,
        predictionConfidence: confidence,
        predictionMadeAt: ws + 3 * 60 * 1000,
        actualResult,
        predictionCorrect: prediction !== "NEUTRAL" ? prediction === actualResult : null,
        analysisFactors: factors,
      });
    });

    const sortedPast = pastWs.sort((a, b) => b.windowStart - a.windowStart).slice(0, 10);
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
      };
    } else {
      cw = {
        windowStart: currentWS,
        windowEnd: currentWS + 5 * 60 * 1000,
        candles: currentCandles,
        prediction: null,
        predictionConfidence: 0,
        predictionMadeAt: null,
        actualResult: null,
        predictionCorrect: null,
        analysisFactors: { momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50 },
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
      // Window rolled over
      const prevCandles = candlesRef.current.filter(
        (c) => c.time >= cw.windowStart && c.time < cw.windowStart + 5 * 60 * 1000
      );
      if (prevCandles.length > 0) {
        const sorted = prevCandles.sort((a, b) => a.time - b.time);
        const actualResult: "UP" | "DOWN" = sorted[sorted.length - 1].close >= sorted[0].open ? "UP" : "DOWN";
        const finalizedWindow: FiveMinWindow = {
          ...cw,
          candles: sorted,
          actualResult,
          predictionCorrect: cw.prediction && cw.prediction !== "NEUTRAL"
            ? cw.prediction === actualResult : null,
        };
        setPastWindows((prev) => [finalizedWindow, ...prev].slice(0, 10));
      }

      const freshCandles = newCandles.filter(
        (c) => c.time >= currentWS && c.time < currentWS + 5 * 60 * 1000
      );
      const newCW: FiveMinWindow = {
        windowStart: currentWS,
        windowEnd: currentWS + 5 * 60 * 1000,
        candles: freshCandles,
        prediction: null,
        predictionConfidence: 0,
        predictionMadeAt: null,
        actualResult: null,
        predictionCorrect: null,
        analysisFactors: { momentum: 0, volumeDelta: 0, priceVelocity: 0, rsiScore: 50 },
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

      if (shouldPredict && !cw.prediction && analysisCandles.length > 0) {
        const { prediction, confidence, factors } = computePrediction(analysisCandles);
        const updated: FiveMinWindow = {
          ...cw,
          candles: sortedWindow,
          prediction,
          predictionConfidence: confidence,
          predictionMadeAt: Date.now(),
          analysisFactors: factors,
        };
        setCurrentWindow(updated);
        currentWindowRef.current = updated;
      } else {
        const updated: FiveMinWindow = { ...cw, candles: sortedWindow };
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
  };
}
