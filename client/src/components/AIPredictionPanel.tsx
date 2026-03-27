/**
 * AIPredictionPanel — AI-powered secondary prediction with UP/DOWN/SKIP recommendation
 * Design: Glassmorphic Night Sky — side panel with risk assessment and reasoning
 */

import { FiveMinWindow } from "@/hooks/useBitcoinData";
import { trpc } from "@/lib/trpc";
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, ShieldOff,
  CheckCircle2, Loader2, Sparkles, Shield, ShieldAlert
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AIPredictionPanelProps {
  currentWindow: FiveMinWindow | null;
  isInAnalysisPhase: boolean;
  sessionAccuracy: number;
  onResult?: (pred: "UP" | "DOWN" | "SKIP" | null, conf: number | undefined, risk: "LOW" | "MEDIUM" | "HIGH" | null) => void;
}

type AIPrediction = {
  prediction: "UP" | "DOWN" | "SKIP";
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  supportingSignals: string[];
  riskFactors: string[];
};

function RiskBadge({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  const config = {
    LOW: { color: "#00d4ff", bg: "rgba(0,212,255,0.1)", border: "rgba(0,212,255,0.25)", icon: Shield },
    MEDIUM: { color: "#ffd700", bg: "rgba(255,215,0,0.1)", border: "rgba(255,215,0,0.25)", icon: ShieldAlert },
    HIGH: { color: "#ff4757", bg: "rgba(255,71,87,0.1)", border: "rgba(255,71,87,0.25)", icon: ShieldOff },
  };
  const { color, bg, border, icon: Icon } = config[level];
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono-data font-semibold"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <Icon size={10} />
      {level} RISK
    </div>
  );
}

function AgreementBadge({ mathPred, aiPred }: { mathPred: string | null; aiPred: string }) {
  if (!mathPred || mathPred === "NEUTRAL") return null;
  const agree = mathPred === aiPred;
  const skip = aiPred === "SKIP";
  if (skip) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono-data"
      style={{
        background: agree ? "rgba(0,212,255,0.08)" : "rgba(255,71,87,0.08)",
        border: `1px solid ${agree ? "rgba(0,212,255,0.2)" : "rgba(255,71,87,0.2)"}`,
        color: agree ? "#00d4ff" : "#ff4757",
      }}
    >
      {agree ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
      {agree ? "Models Agree" : "Models Disagree"}
    </div>
  );
}

export default function AIPredictionPanel({
  currentWindow,
  isInAnalysisPhase,
  sessionAccuracy,
  onResult,
}: AIPredictionPanelProps) {
  const [aiResult, setAiResult] = useState<AIPrediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastWindowRef = useRef<number | null>(null);

  const aiPredictMutation = trpc.btc.aiPredict.useMutation();

  // Trigger AI prediction when math model has a prediction ready
  useEffect(() => {
    if (!currentWindow) return;
    if (isInAnalysisPhase) return; // Wait until analysis phase is done
    if (!currentWindow.prediction) return;
    if (currentWindow.prediction === "NEUTRAL") return;

    // Only call once per window
    if (lastWindowRef.current === currentWindow.windowStart) return;

    lastWindowRef.current = currentWindow.windowStart;
    setIsLoading(true);
    setError(null);
    setAiResult(null);

    aiPredictMutation.mutate(
      {
        candles: currentWindow.candles.slice(0, 3),
        factors: currentWindow.analysisFactors,
        mathPrediction: currentWindow.prediction,
        mathConfidence: currentWindow.predictionConfidence,
        sessionAccuracy,
        windowStart: currentWindow.windowStart,
      },
      {
        onSuccess: (data) => {
          const result = data as AIPrediction;
          setAiResult(result);
          setIsLoading(false);
          onResult?.(result.prediction, result.confidence, result.riskLevel);
        },
        onError: (err) => {
          setError(err.message);
          setIsLoading(false);
        },
      }
    );
  }, [currentWindow?.windowStart, currentWindow?.prediction, isInAnalysisPhase]);

  // Reset when window changes
  useEffect(() => {
    if (!currentWindow) return;
    if (lastWindowRef.current !== null && lastWindowRef.current !== currentWindow.windowStart) {
      setAiResult(null);
      setError(null);
    }
  }, [currentWindow?.windowStart]);

  const mathPred = currentWindow?.prediction ?? null;
  const mathConf = currentWindow?.predictionConfidence ?? 0;

  const predColor = (pred: string | null) =>
    pred === "UP" ? "#00d4ff" :
    pred === "DOWN" ? "#ff4757" :
    pred === "SKIP" ? "#ffd700" :
    "#556677";

  return (
    <div
      className="glass-panel p-4 flex flex-col gap-3"
      style={{ border: "1px solid rgba(255,215,0,0.15)", boxShadow: "0 0 20px rgba(255,215,0,0.05)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: "#ffd700" }} />
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          AI Analysis
        </span>
        <span
          className="text-xs font-mono-data px-1.5 py-0.5 rounded"
          style={{ background: "rgba(255,215,0,0.08)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.2)" }}
        >
          Gemini 2.5
        </span>
      </div>

      {/* Waiting state */}
      {!currentWindow?.prediction && (
        <div className="text-center py-3">
          <Brain size={24} className="mx-auto mb-2" style={{ color: "#334455" }} />
          <div className="text-xs font-mono-data" style={{ color: "#445566" }}>
            {isInAnalysisPhase ? "Collecting data for AI analysis..." : "Waiting for math model..."}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-3">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin" style={{ color: "#ffd700" }} />
          <div className="text-xs font-mono-data" style={{ color: "#ffd700" }}>
            AI analyzing market conditions...
          </div>
          <div className="text-xs font-mono-data mt-1" style={{ color: "#445566" }}>
            Evaluating {currentWindow?.candles.slice(0, 3).length ?? 0} candles + 10 indicators
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div
          className="flex items-start gap-2 p-2 rounded"
          style={{ background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.2)" }}
        >
          <AlertTriangle size={12} style={{ color: "#ff4757", flexShrink: 0, marginTop: "1px" }} />
          <span className="text-xs font-mono-data" style={{ color: "#ff4757" }}>
            AI unavailable — use math model only
          </span>
        </div>
      )}

      {/* AI Result */}
      {aiResult && !isLoading && (
        <>
          {/* Prediction display */}
          <div
            className="flex items-center justify-between p-3 rounded-lg"
            style={{
              background: `${predColor(aiResult.prediction)}10`,
              border: `1px solid ${predColor(aiResult.prediction)}30`,
            }}
          >
            <div className="flex items-center gap-2">
              {aiResult.prediction === "UP" ? (
                <TrendingUp size={20} style={{ color: predColor("UP"), filter: "drop-shadow(0 0 6px #00d4ff)" }} />
              ) : aiResult.prediction === "DOWN" ? (
                <TrendingDown size={20} style={{ color: predColor("DOWN"), filter: "drop-shadow(0 0 6px #ff4757)" }} />
              ) : (
                <AlertTriangle size={20} style={{ color: predColor("SKIP"), filter: "drop-shadow(0 0 6px #ffd700)" }} />
              )}
              <div>
                <div
                  className="text-lg font-bold"
                  style={{ color: predColor(aiResult.prediction), fontFamily: "Outfit, sans-serif" }}
                >
                  {aiResult.prediction === "SKIP" ? "SKIP" : aiResult.prediction}
                </div>
                <div className="text-xs font-mono-data" style={{ color: `${predColor(aiResult.prediction)}80` }}>
                  {aiResult.confidence.toFixed(0)}% confidence
                </div>
              </div>
            </div>
            <RiskBadge level={aiResult.riskLevel} />
          </div>

          {/* Confidence bar */}
          <div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${aiResult.confidence}%`,
                  background: `linear-gradient(90deg, ${predColor(aiResult.prediction)}40, ${predColor(aiResult.prediction)})`,
                  boxShadow: `0 0 8px ${predColor(aiResult.prediction)}50`,
                }}
              />
            </div>
          </div>

          {/* Agreement badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <AgreementBadge mathPred={mathPred} aiPred={aiResult.prediction} />
            {mathPred && mathPred !== "NEUTRAL" && (
              <span className="text-xs font-mono-data" style={{ color: "#445566" }}>
                Math: {mathPred} ({mathConf.toFixed(0)}%)
              </span>
            )}
          </div>

          {/* Reasoning */}
          <div
            className="p-2.5 rounded"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "#8899aa" }}>
              {aiResult.reasoning}
            </p>
          </div>

          {/* Supporting signals */}
          {aiResult.supportingSignals.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5 tracking-wider uppercase" style={{ color: "#556677" }}>
                Supporting
              </div>
              <div className="space-y-1">
                {aiResult.supportingSignals.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#00d4ff" }} />
                    <span className="text-xs font-mono-data" style={{ color: "#667788" }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk factors */}
          {aiResult.riskFactors.length > 0 && (
            <div>
              <div className="text-xs font-semibold mb-1.5 tracking-wider uppercase" style={{ color: "#556677" }}>
                Risk Factors
              </div>
              <div className="space-y-1">
                {aiResult.riskFactors.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#ff4757" }} />
                    <span className="text-xs font-mono-data" style={{ color: "#667788" }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
