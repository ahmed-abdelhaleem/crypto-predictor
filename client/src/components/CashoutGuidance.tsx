/**
 * CashoutGuidance — Real-time mid-window prediction revision and cashout advice
 * Shows when to hold vs cashout based on live signal changes
 * Design: Glassmorphic Night Sky
 */

import { trpc } from "@/lib/trpc";
import { FiveMinWindow, Candle, AdvancedFactors } from "@/hooks/useBitcoinData";
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, Shield, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CashoutGuidanceProps {
  currentWindow: FiveMinWindow | null;
  currentPrice: number;
  windowProgress: number;
}

type Recommendation = "HOLD" | "CASHOUT" | "CONSIDER_CASHOUT";

interface RevisionResult {
  shouldRevise: boolean;
  newPrediction: "UP" | "DOWN" | "NEUTRAL";
  newConfidence: number;
  predictionChanged: boolean;
  confidenceChange: number;
  priceChangePct: number;
  cashoutGuidance: {
    recommendation: Recommendation;
    urgency: "LOW" | "MEDIUM" | "HIGH";
    reason: string;
    currentPnL: number;
    riskScore: number;
  } | null;
  revisedAt: number;
}

export default function CashoutGuidance({ currentWindow, currentPrice, windowProgress }: CashoutGuidanceProps) {
  const [revision, setRevision] = useState<RevisionResult | null>(null);
  const [lastRevisionTime, setLastRevisionTime] = useState(0);
  const lastWindowStart = useRef<number | null>(null);

  const revisionMutation = trpc.btc.midWindowRevision.useMutation({
    onSuccess: (data) => {
      setRevision(data as RevisionResult);
      setLastRevisionTime(Date.now());
    },
  });

  // Trigger revision check every 60 seconds when prediction exists and window is > 2 min in
  useEffect(() => {
    if (!currentWindow?.prediction || !currentPrice) return;

    const minuteIntoWindow = (Date.now() - currentWindow.windowStart) / (60 * 1000);
    if (minuteIntoWindow < 2) return; // Don't revise in first 2 minutes

    // Reset revision when window changes
    if (lastWindowStart.current !== currentWindow.windowStart) {
      lastWindowStart.current = currentWindow.windowStart;
      setRevision(null);
      setLastRevisionTime(0);
      return;
    }

    // Check every 60 seconds
    const timeSinceLastRevision = Date.now() - lastRevisionTime;
    if (lastRevisionTime > 0 && timeSinceLastRevision < 60000) return;

    // Trigger revision
    const candles = currentWindow.candles.map((c: Candle) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      isBullish: c.isBullish,
    }));

    const factors = currentWindow.analysisFactors as AdvancedFactors;

    revisionMutation.mutate({
      candles,
      factors: {
        momentum: factors.momentum,
        volumeDelta: factors.volumeDelta,
        priceVelocity: factors.priceVelocity,
        rsiScore: factors.rsiScore,
        emaSignal: factors.emaSignal,
        bollingerPos: factors.bollingerPos,
        vwapDeviation: factors.vwapDeviation,
        bodyRatio: factors.bodyRatio,
        wickBias: factors.wickBias,
        trendStrength: factors.trendStrength,
        rawScore: factors.rawScore,
        signalStrength: factors.signalStrength,
      },
      originalPrediction: currentWindow.prediction as "UP" | "DOWN" | "NEUTRAL",
      originalConfidence: currentWindow.predictionConfidence,
      currentPrice,
      openPrice: currentWindow.openPrice,
      minuteIntoWindow,
      windowStart: currentWindow.windowStart,
    });
  }, [Math.floor(windowProgress / 20)]); // Check every ~20% progress

  if (!currentWindow?.prediction) return null;

  const guidance = revision?.cashoutGuidance;
  const minuteIntoWindow = (Date.now() - currentWindow.windowStart) / (60 * 1000);
  const timeLeft = Math.max(0, 5 - minuteIntoWindow);

  if (!guidance && minuteIntoWindow < 2) {
    return (
      <div className="glass-panel p-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} style={{ color: "#ffd700" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Live Signal Monitor
          </span>
        </div>
        <div className="text-xs" style={{ color: "#445566" }}>
          Signal monitoring starts at 2:00 into window. Currently collecting data...
        </div>
      </div>
    );
  }

  if (!guidance) return null;

  const recColor =
    guidance.recommendation === "CASHOUT" ? "#ff4757" :
    guidance.recommendation === "CONSIDER_CASHOUT" ? "#ffd700" :
    "#00d4ff";

  const recIcon =
    guidance.recommendation === "CASHOUT" ? <AlertTriangle size={14} /> :
    guidance.recommendation === "CONSIDER_CASHOUT" ? <DollarSign size={14} /> :
    <Shield size={14} />;

  const recLabel =
    guidance.recommendation === "CASHOUT" ? "CASHOUT NOW" :
    guidance.recommendation === "CONSIDER_CASHOUT" ? "CONSIDER CASHOUT" :
    "HOLD POSITION";

  const pnlColor = guidance.currentPnL >= 0 ? "#00d4ff" : "#ff4757";

  return (
    <div
      className="glass-panel p-4"
      style={{
        border: `1px solid ${recColor}30`,
        boxShadow: `0 0 20px ${recColor}10`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div style={{ color: recColor }}>{recIcon}</div>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          Live Signal Monitor
        </span>
        {revision?.predictionChanged && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,71,87,0.2)", color: "#ff4757", border: "1px solid rgba(255,71,87,0.4)" }}
          >
            SIGNAL CHANGED
          </span>
        )}
      </div>

      {/* Main recommendation */}
      <div
        className="rounded p-3 mb-3 flex items-center gap-3"
        style={{ background: `${recColor}10`, border: `1px solid ${recColor}30` }}
      >
        <div
          className="text-sm font-bold tracking-wide"
          style={{ color: recColor, fontFamily: "Outfit, sans-serif" }}
        >
          {recLabel}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: `${recColor}20`, color: recColor }}
          >
            Risk: {guidance.riskScore.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="text-xs mb-3 leading-relaxed" style={{ color: "#8899aa" }}>
        {guidance.reason}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-xs font-mono-data font-bold" style={{ color: pnlColor }}>
            {guidance.currentPnL >= 0 ? "+" : ""}{guidance.currentPnL.toFixed(3)}%
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>Est. P&L</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-mono-data font-bold" style={{ color: "#ffd700" }}>
            {timeLeft.toFixed(1)}m
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>Time Left</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-mono-data font-bold" style={{ color: "#a78bfa" }}>
            {revision?.newConfidence.toFixed(0)}%
          </div>
          <div className="text-xs" style={{ color: "#445566" }}>Conf Now</div>
        </div>
      </div>

      {/* Revised prediction if changed */}
      {revision?.predictionChanged && (
        <div
          className="rounded p-2 flex items-center gap-2"
          style={{ background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)" }}
        >
          <div className="text-xs" style={{ color: "#8899aa" }}>
            Original: <span style={{ color: "#ffd700" }}>{currentWindow.prediction}</span>
          </div>
          <div className="text-xs mx-1" style={{ color: "#334455" }}>→</div>
          <div className="text-xs" style={{ color: "#8899aa" }}>
            Revised: <span style={{ color: revision.newPrediction === "UP" ? "#00d4ff" : "#ff4757" }}>
              {revision.newPrediction}
            </span>
          </div>
          <div className="ml-auto text-xs font-mono-data" style={{ color: "#ff4757" }}>
            Δ{revision.confidenceChange.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Risk meter */}
      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs" style={{ color: "#556677" }}>Risk Level</span>
          <span
            className="text-xs font-mono-data"
            style={{
              color: guidance.urgency === "HIGH" ? "#ff4757" :
                     guidance.urgency === "MEDIUM" ? "#ffd700" : "#00d4ff",
            }}
          >
            {guidance.urgency}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${guidance.riskScore}%`,
              background: guidance.riskScore >= 70
                ? "linear-gradient(90deg, rgba(255,71,87,0.4), #ff4757)"
                : guidance.riskScore >= 40
                ? "linear-gradient(90deg, rgba(255,215,0,0.4), #ffd700)"
                : "linear-gradient(90deg, rgba(0,212,255,0.4), #00d4ff)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
