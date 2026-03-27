/**
 * RecommendationEngine — Smart UP/DOWN/SKIP recommendation combining math + AI models
 * Design: Glassmorphic Night Sky — prominent decision card with risk assessment
 *
 * Decision Logic:
 * - STRONG UP/DOWN: Both models agree + high confidence (>= 70%)
 * - LEAN UP/DOWN: Math model strong + moderate confidence (55-70%)
 * - SKIP: Models disagree OR low confidence (<55%) OR HIGH risk
 */

import { FiveMinWindow, SessionStats } from "@/hooks/useBitcoinData";
import {
  TrendingUp, TrendingDown, AlertTriangle, Zap,
  Target, Activity, BarChart2
} from "lucide-react";

interface RecommendationEngineProps {
  currentWindow: FiveMinWindow | null;
  sessionStats: SessionStats;
  aiPrediction?: "UP" | "DOWN" | "SKIP" | null;
  aiConfidence?: number;
  aiRiskLevel?: "LOW" | "MEDIUM" | "HIGH" | null;
}

type Decision = {
  action: "UP" | "DOWN" | "SKIP";
  strength: "STRONG" | "LEAN" | "SKIP";
  reason: string;
  riskScore: number; // 0-100, higher = riskier
  factors: string[];
  warnings: string[];
};

function computeDecision(
  window: FiveMinWindow | null,
  stats: SessionStats,
  aiPred?: "UP" | "DOWN" | "SKIP" | null,
  aiConf?: number,
  aiRisk?: "LOW" | "MEDIUM" | "HIGH" | null
): Decision {
  const skip: Decision = {
    action: "SKIP",
    strength: "SKIP",
    reason: "Insufficient data — wait for next window",
    riskScore: 80,
    factors: [],
    warnings: ["No prediction available yet"],
  };

  if (!window?.prediction || window.prediction === "NEUTRAL") return skip;

  const mathPred = window.prediction as "UP" | "DOWN";
  const mathConf = window.predictionConfidence;
  const factors = window.analysisFactors;

  // ---- Risk Score Calculation ----
  let riskScore = 50; // Base risk

  // Lower risk for high confidence
  if (mathConf >= 75) riskScore -= 15;
  else if (mathConf >= 60) riskScore -= 8;
  else if (mathConf < 50) riskScore += 15;

  // Lower risk for strong signal
  if (factors.signalStrength === "STRONG") riskScore -= 12;
  else if (factors.signalStrength === "WEAK") riskScore += 12;

  // Higher risk when models disagree
  if (aiPred && aiPred !== "SKIP" && aiPred !== mathPred) riskScore += 20;
  if (aiPred === "SKIP") riskScore += 15;

  // Higher risk for HIGH AI risk level
  if (aiRisk === "HIGH") riskScore += 15;
  else if (aiRisk === "LOW") riskScore -= 10;

  // Higher risk for low session accuracy
  if (stats.accuracy > 0 && stats.accuracy < 55) riskScore += 10;
  if (stats.accuracy >= 70) riskScore -= 8;

  // Higher risk for consecutive losses
  if (stats.currentStreakType === "LOSS" && stats.currentStreak >= 2) riskScore += 10;

  // Bollinger Band extremes add risk (overbought/oversold)
  if (factors.bollingerPos > 85 || factors.bollingerPos < 15) riskScore += 8;

  // Conflicting momentum and volume
  if (Math.sign(factors.momentum) !== Math.sign(factors.volumeDelta) && Math.abs(factors.momentum) > 20) {
    riskScore += 8;
  }

  riskScore = Math.max(5, Math.min(95, riskScore));

  // ---- Decision Logic ----
  const modelsAgree = aiPred && aiPred !== "SKIP" && aiPred === mathPred;
  const aiSaysSkip = aiPred === "SKIP";
  const highRisk = riskScore >= 65;
  const lowConfidence = mathConf < 55;

  const supportingFactors: string[] = [];
  const warnings: string[] = [];

  // Build factor list
  if (Math.abs(factors.momentum) > 20) {
    supportingFactors.push(`Strong momentum (${factors.momentum > 0 ? "+" : ""}${factors.momentum})`);
  }
  if (Math.abs(factors.volumeDelta) > 20) {
    supportingFactors.push(`Volume pressure (${factors.volumeDelta > 0 ? "bullish" : "bearish"}: ${Math.abs(factors.volumeDelta).toFixed(0)}%)`);
  }
  if (Math.abs(factors.emaSignal) > 10) {
    supportingFactors.push(`EMA crossover signal (${factors.emaSignal > 0 ? "bullish" : "bearish"})`);
  }
  if (factors.rsiScore > 65) {
    supportingFactors.push(`RSI overbought territory (${factors.rsiScore})`);
  } else if (factors.rsiScore < 35) {
    supportingFactors.push(`RSI oversold territory (${factors.rsiScore})`);
  }
  if (modelsAgree) {
    supportingFactors.push(`Math + AI models in agreement`);
  }
  if (factors.bodyRatio > 65) {
    supportingFactors.push(`Strong candle bodies (${factors.bodyRatio}% body ratio)`);
  }

  // Build warning list
  if (!modelsAgree && aiPred && aiPred !== "SKIP") {
    warnings.push(`AI model predicts ${aiPred} — models disagree`);
  }
  if (aiSaysSkip) {
    warnings.push("AI recommends skipping this window");
  }
  if (stats.currentStreakType === "LOSS" && stats.currentStreak >= 2) {
    warnings.push(`${stats.currentStreak}-window losing streak — consider caution`);
  }
  if (factors.bollingerPos > 85) {
    warnings.push("Price near upper Bollinger Band — potential reversal zone");
  } else if (factors.bollingerPos < 15) {
    warnings.push("Price near lower Bollinger Band — potential reversal zone");
  }
  if (Math.abs(factors.vwapDeviation) > 30) {
    warnings.push(`Price significantly ${factors.vwapDeviation > 0 ? "above" : "below"} VWAP`);
  }

  // ---- Final Decision ----
  if (aiSaysSkip && highRisk) {
    return {
      action: "SKIP",
      strength: "SKIP",
      reason: `Both models suggest caution — risk score ${riskScore}/100`,
      riskScore,
      factors: supportingFactors,
      warnings,
    };
  }

  if (lowConfidence && !modelsAgree) {
    return {
      action: "SKIP",
      strength: "SKIP",
      reason: `Low confidence (${mathConf.toFixed(0)}%) and models disagree — skip this window`,
      riskScore,
      factors: supportingFactors,
      warnings,
    };
  }

  if (highRisk && !modelsAgree) {
    return {
      action: "SKIP",
      strength: "SKIP",
      reason: `High risk (${riskScore}/100) with conflicting signals — not worth the bet`,
      riskScore,
      factors: supportingFactors,
      warnings,
    };
  }

  const strength: "STRONG" | "LEAN" =
    modelsAgree && mathConf >= 70 && riskScore < 50 ? "STRONG" : "LEAN";

  const reason = strength === "STRONG"
    ? `Both models agree on ${mathPred} with ${mathConf.toFixed(0)}% confidence — favorable risk/reward`
    : `Math model signals ${mathPred} (${mathConf.toFixed(0)}% conf) — moderate conviction`;

  return {
    action: mathPred,
    strength,
    reason,
    riskScore,
    factors: supportingFactors,
    warnings,
  };
}

function RiskMeter({ score }: { score: number }) {
  const color = score >= 65 ? "#ff4757" : score >= 45 ? "#ffd700" : "#00d4ff";
  const label = score >= 65 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono-data" style={{ color: "#556677" }}>Risk Score</span>
        <span className="text-xs font-mono-data font-bold" style={{ color }}>{score}/100 · {label}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg, #00d4ff40, ${color})`,
            boxShadow: `0 0 8px ${color}50`,
          }}
        />
      </div>
    </div>
  );
}

export default function RecommendationEngine({
  currentWindow,
  sessionStats,
  aiPrediction,
  aiConfidence,
  aiRiskLevel,
}: RecommendationEngineProps) {
  const decision = computeDecision(
    currentWindow,
    sessionStats,
    aiPrediction,
    aiConfidence,
    aiRiskLevel
  );

  const actionColor =
    decision.action === "UP" ? "#00d4ff" :
    decision.action === "DOWN" ? "#ff4757" :
    "#ffd700";

  const strengthLabel =
    decision.strength === "STRONG" ? "STRONG SIGNAL" :
    decision.strength === "LEAN" ? "LEAN SIGNAL" :
    "SKIP WINDOW";

  const bgGlow =
    decision.action === "UP" ? "rgba(0,212,255,0.06)" :
    decision.action === "DOWN" ? "rgba(255,71,87,0.06)" :
    "rgba(255,215,0,0.04)";

  if (!currentWindow?.prediction) {
    return (
      <div
        className="glass-panel p-4"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} style={{ color: "#ffd700" }} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
            Decision Engine
          </span>
        </div>
        <div className="text-center py-3">
          <Activity size={20} className="mx-auto mb-2" style={{ color: "#334455" }} />
          <div className="text-xs font-mono-data" style={{ color: "#445566" }}>
            Awaiting prediction signal...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass-panel p-4"
      style={{
        border: `1px solid ${actionColor}25`,
        boxShadow: `0 0 25px ${bgGlow}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Target size={14} style={{ color: "#ffd700" }} />
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
          Decision Engine
        </span>
        <span
          className="ml-auto text-xs font-mono-data px-2 py-0.5 rounded-full font-semibold"
          style={{
            background: `${actionColor}15`,
            color: actionColor,
            border: `1px solid ${actionColor}35`,
          }}
        >
          {strengthLabel}
        </span>
      </div>

      {/* Main decision */}
      <div
        className="flex items-center justify-center py-4 mb-3 rounded-lg"
        style={{ background: `${actionColor}08`, border: `1px solid ${actionColor}20` }}
      >
        {decision.action === "UP" ? (
          <div className="text-center">
            <TrendingUp
              size={36}
              style={{ color: actionColor, filter: `drop-shadow(0 0 10px ${actionColor})` }}
              className="mx-auto mb-1"
            />
            <div
              className="text-3xl font-bold tracking-widest"
              style={{ color: actionColor, fontFamily: "Outfit, sans-serif" }}
            >
              BET UP
            </div>
            <div className="text-xs font-mono-data mt-1" style={{ color: `${actionColor}70` }}>
              Price likely to rise ↑
            </div>
          </div>
        ) : decision.action === "DOWN" ? (
          <div className="text-center">
            <TrendingDown
              size={36}
              style={{ color: actionColor, filter: `drop-shadow(0 0 10px ${actionColor})` }}
              className="mx-auto mb-1"
            />
            <div
              className="text-3xl font-bold tracking-widest"
              style={{ color: actionColor, fontFamily: "Outfit, sans-serif" }}
            >
              BET DOWN
            </div>
            <div className="text-xs font-mono-data mt-1" style={{ color: `${actionColor}70` }}>
              Price likely to fall ↓
            </div>
          </div>
        ) : (
          <div className="text-center">
            <AlertTriangle
              size={36}
              style={{ color: actionColor, filter: `drop-shadow(0 0 10px ${actionColor})` }}
              className="mx-auto mb-1"
            />
            <div
              className="text-3xl font-bold tracking-widest"
              style={{ color: actionColor, fontFamily: "Outfit, sans-serif" }}
            >
              SKIP
            </div>
            <div className="text-xs font-mono-data mt-1" style={{ color: `${actionColor}70` }}>
              Too risky — sit this one out
            </div>
          </div>
        )}
      </div>

      {/* Reason */}
      <div
        className="p-2.5 rounded mb-3 text-xs font-mono-data leading-relaxed"
        style={{ background: "rgba(255,255,255,0.03)", color: "#8899aa", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {decision.reason}
      </div>

      {/* Risk meter */}
      <div className="mb-3">
        <RiskMeter score={decision.riskScore} />
      </div>

      {/* Model comparison */}
      <div
        className="grid grid-cols-2 gap-2 mb-3 p-2 rounded"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <BarChart2 size={10} style={{ color: "#556677" }} />
            <span className="text-xs font-mono-data" style={{ color: "#445566" }}>Math Model</span>
          </div>
          <div
            className="text-sm font-bold font-mono-data"
            style={{
              color: currentWindow.prediction === "UP" ? "#00d4ff" :
                currentWindow.prediction === "DOWN" ? "#ff4757" : "#ffd700"
            }}
          >
            {currentWindow.prediction}
          </div>
          <div className="text-xs font-mono-data" style={{ color: "#334455" }}>
            {currentWindow.predictionConfidence.toFixed(0)}% conf
          </div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap size={10} style={{ color: "#556677" }} />
            <span className="text-xs font-mono-data" style={{ color: "#445566" }}>AI Model</span>
          </div>
          <div
            className="text-sm font-bold font-mono-data"
            style={{
              color: aiPrediction === "UP" ? "#00d4ff" :
                aiPrediction === "DOWN" ? "#ff4757" :
                aiPrediction === "SKIP" ? "#ffd700" : "#334455"
            }}
          >
            {aiPrediction ?? "—"}
          </div>
          <div className="text-xs font-mono-data" style={{ color: "#334455" }}>
            {aiConfidence != null ? `${aiConfidence.toFixed(0)}% conf` : "pending"}
          </div>
        </div>
      </div>

      {/* Supporting factors */}
      {decision.factors.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold mb-1 tracking-wider uppercase" style={{ color: "#445566" }}>
            Supporting
          </div>
          <div className="space-y-0.5">
            {decision.factors.slice(0, 3).map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#00d4ff" }} />
                <span className="text-xs font-mono-data" style={{ color: "#667788" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {decision.warnings.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1 tracking-wider uppercase" style={{ color: "#445566" }}>
            Warnings
          </div>
          <div className="space-y-0.5">
            {decision.warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#ff4757" }} />
                <span className="text-xs font-mono-data" style={{ color: "#667788" }}>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
