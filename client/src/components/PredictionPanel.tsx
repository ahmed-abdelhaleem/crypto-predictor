/**
 * PredictionPanel — Shows current 5-minute window prediction
 * Design: Glassmorphic Night Sky — glass card, animated confidence gauge, result badge
 */

import { FiveMinWindow } from "@/hooks/useBitcoinData";
import { TrendingDown, TrendingUp, Minus, Clock, Brain, Zap } from "lucide-react";

interface PredictionPanelProps {
  currentWindow: FiveMinWindow | null;
  windowProgress: number;
  analysisProgress: number;
  isInAnalysisPhase: boolean;
  accuracy: number;
}

function FactorBar({ label, value, color }: { label: string; value: number; color: string }) {
  const normalized = Math.max(0, Math.min(100, (value + 100) / 2)); // -100..100 → 0..100
  const isPositive = value >= 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-mono-data" style={{ color: "#8899aa" }}>{label}</span>
        <span className="text-xs font-mono-data font-medium" style={{ color }}>
          {value > 0 ? "+" : ""}{value}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${normalized}%`,
            background: isPositive
              ? `linear-gradient(90deg, rgba(0,212,255,0.3), ${color})`
              : `linear-gradient(90deg, ${color}, rgba(255,71,87,0.3))`,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}

export default function PredictionPanel({
  currentWindow,
  windowProgress,
  analysisProgress,
  isInAnalysisPhase,
  accuracy,
}: PredictionPanelProps) {
  const prediction = currentWindow?.prediction;
  const confidence = currentWindow?.predictionConfidence ?? 0;
  const factors = currentWindow?.analysisFactors;

  const predColor =
    prediction === "UP" ? "#00d4ff" :
    prediction === "DOWN" ? "#ff4757" :
    "#ffd700";

  const windowTimeLeft = currentWindow
    ? Math.max(0, Math.ceil((currentWindow.windowEnd - Date.now()) / 1000))
    : 0;
  const analysisTimeLeft = currentWindow
    ? Math.max(0, Math.ceil((currentWindow.windowStart + 3 * 60 * 1000 - Date.now()) / 1000))
    : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Prediction Result Card */}
      <div
        className="glass-panel p-4 flex-shrink-0"
        style={{
          border: prediction ? `1px solid ${predColor}30` : "1px solid rgba(255,255,255,0.1)",
          boxShadow: prediction ? `0 0 30px ${predColor}15, inset 0 0 30px ${predColor}05` : "none",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Brain size={14} style={{ color: "#ffd700" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            5-Min Prediction
          </span>
          {prediction && (
            <span
              className="ml-auto text-xs font-mono-data px-2 py-0.5 rounded-full"
              style={{ background: `${predColor}20`, color: predColor, border: `1px solid ${predColor}40` }}
            >
              {confidence.toFixed(0)}% conf
            </span>
          )}
        </div>

        {/* Main prediction display */}
        <div className="flex items-center justify-center py-3">
          {!currentWindow || (!prediction && isInAnalysisPhase) ? (
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <div className="w-2 h-2 rounded-full pulse-live" style={{ background: "#ffd700" }} />
                <span className="text-sm font-semibold" style={{ color: "#ffd700" }}>Analyzing...</span>
              </div>
              <div className="text-xs font-mono-data" style={{ color: "#556677" }}>
                {analysisTimeLeft > 0 ? `${formatTime(analysisTimeLeft)} until prediction` : "Computing..."}
              </div>
            </div>
          ) : prediction === "UP" ? (
            <div className="text-center result-bounce">
              <TrendingUp size={40} style={{ color: "#00d4ff", filter: "drop-shadow(0 0 12px #00d4ff)" }} className="mx-auto mb-1" />
              <div className="text-2xl font-bold tracking-wide" style={{ color: "#00d4ff", fontFamily: "Outfit, sans-serif" }}>
                BULLISH
              </div>
              <div className="text-xs font-mono-data mt-1" style={{ color: "#00d4ff80" }}>Trend: UP ↑</div>
            </div>
          ) : prediction === "DOWN" ? (
            <div className="text-center result-bounce">
              <TrendingDown size={40} style={{ color: "#ff4757", filter: "drop-shadow(0 0 12px #ff4757)" }} className="mx-auto mb-1" />
              <div className="text-2xl font-bold tracking-wide" style={{ color: "#ff4757", fontFamily: "Outfit, sans-serif" }}>
                BEARISH
              </div>
              <div className="text-xs font-mono-data mt-1" style={{ color: "#ff475780" }}>Trend: DOWN ↓</div>
            </div>
          ) : (
            <div className="text-center">
              <Minus size={40} style={{ color: "#ffd700" }} className="mx-auto mb-1" />
              <div className="text-2xl font-bold tracking-wide" style={{ color: "#ffd700", fontFamily: "Outfit, sans-serif" }}>
                NEUTRAL
              </div>
              <div className="text-xs font-mono-data mt-1" style={{ color: "#ffd70080" }}>No clear signal</div>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        {prediction && (
          <div className="mt-2">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${confidence}%`,
                  background: `linear-gradient(90deg, ${predColor}60, ${predColor})`,
                  boxShadow: `0 0 10px ${predColor}60`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Window Progress */}
      <div className="glass-panel p-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} style={{ color: "#8899aa" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Window Progress
          </span>
          <span className="ml-auto text-xs font-mono-data" style={{ color: "#ffd700" }}>
            {formatTime(windowTimeLeft)}
          </span>
        </div>

        {/* 5-min bar */}
        <div className="relative h-3 rounded-full overflow-hidden mb-1" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${windowProgress}%`,
              background: "linear-gradient(90deg, rgba(255,215,0,0.4), #ffd700)",
              boxShadow: "0 0 8px rgba(255,215,0,0.5)",
            }}
          />
          {/* 3-min marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5"
            style={{
              left: "60%",
              background: isInAnalysisPhase ? "#00d4ff" : "rgba(0,212,255,0.4)",
              boxShadow: isInAnalysisPhase ? "0 0 6px #00d4ff" : "none",
            }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono-data" style={{ color: "#445566" }}>
          <span>0:00</span>
          <span style={{ color: isInAnalysisPhase ? "#00d4ff" : "#445566" }}>3:00 ← predict</span>
          <span>5:00</span>
        </div>

        {/* Analysis phase indicator */}
        {isInAnalysisPhase && (
          <div className="mt-2 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full pulse-live" style={{ background: "#00d4ff" }} />
            <span className="text-xs font-mono-data" style={{ color: "#00d4ff" }}>
              Collecting data · {formatTime(analysisTimeLeft)} left
            </span>
          </div>
        )}
      </div>

      {/* Analysis Factors */}
      {factors && prediction && (
        <div className="glass-panel p-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} style={{ color: "#ffd700" }} />
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
              Signal Factors
            </span>
          </div>
          <FactorBar label="Momentum" value={factors.momentum} color={factors.momentum >= 0 ? "#00d4ff" : "#ff4757"} />
          <FactorBar label="Volume Δ" value={factors.volumeDelta} color={factors.volumeDelta >= 0 ? "#00d4ff" : "#ff4757"} />
          <FactorBar label="Velocity" value={factors.priceVelocity} color={factors.priceVelocity >= 0 ? "#00d4ff" : "#ff4757"} />
          <div className="mb-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-mono-data" style={{ color: "#8899aa" }}>RSI-like</span>
              <span className="text-xs font-mono-data font-medium" style={{ color: factors.rsiScore > 50 ? "#00d4ff" : "#ff4757" }}>
                {factors.rsiScore}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${factors.rsiScore}%`,
                  background: factors.rsiScore > 50
                    ? "linear-gradient(90deg, rgba(0,212,255,0.3), #00d4ff)"
                    : "linear-gradient(90deg, #ff4757, rgba(255,71,87,0.3))",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Accuracy badge */}
      <div className="glass-panel p-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Session Accuracy
          </span>
          <span
            className="text-lg font-bold font-mono-data"
            style={{
              color: accuracy >= 60 ? "#00d4ff" : accuracy >= 40 ? "#ffd700" : "#ff4757",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {accuracy > 0 ? `${accuracy}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
