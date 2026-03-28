/**
 * Home — Main page for CryptoOracle BTC Predictor
 * Design: Glassmorphic Night Sky
 * Layout:
 *   - Left (2/3): Chart + Window History
 *   - Right (1/3): Prediction Panel + Decision Engine + AI Panel + Cashout + Session Stats
 *   - Bottom tabs: ML Model | Pattern Controls | Scheduler
 */

import CandleChart from "@/components/CandleChart";
import LiveTicker from "@/components/LiveTicker";
import PredictionPanel from "@/components/PredictionPanel";
import WindowHistory from "@/components/WindowHistory";
import AIPredictionPanel from "@/components/AIPredictionPanel";
import RecommendationEngine from "@/components/RecommendationEngine";
import SessionStatsPanel from "@/components/SessionStatsPanel";
import MLModelPanel from "@/components/MLModelPanel";
import PatternSettingsPanel from "@/components/PatternSettingsPanel";
import SchedulerPanel from "@/components/SchedulerPanel";
import CashoutGuidance from "@/components/CashoutGuidance";
import { useBitcoinData } from "@/hooks/useBitcoinData";
import { AlertCircle, RefreshCw, Brain, Settings, Clock } from "lucide-react";
import { useState } from "react";

const BG_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663482996437/g7kKL6GCFpLYNEHMGxFTYy/crypto-bg-fPiZmNZE5QfZGj8Bnsoa8f.webp";

type BottomTab = "ml" | "patterns" | "scheduler";

export default function Home() {
  const {
    candles,
    currentWindow,
    pastWindows,
    ticker,
    isLoading,
    error,
    windowProgress,
    analysisProgress,
    isInAnalysisPhase,
    accuracy,
    sessionStats,
    dbHistoryTotal,
  } = useBitcoinData();

  const [aiPrediction, setAiPrediction] = useState<"UP" | "DOWN" | "SKIP" | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | undefined>(undefined);
  const [aiRiskLevel, setAiRiskLevel] = useState<"LOW" | "MEDIUM" | "HIGH" | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("ml");

  const currentPrice = ticker?.price ?? 0;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: `linear-gradient(135deg, #050b1a 0%, #0d1f3c 50%, #050b1a 100%)`,
        fontFamily: "Outfit, sans-serif",
      }}
    >
      {/* Background image overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.12,
          zIndex: 0,
        }}
      />

      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div
          className="float-orb absolute rounded-full"
          style={{
            width: "600px", height: "600px",
            top: "-200px", left: "-150px",
            background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="float-orb-slow absolute rounded-full"
          style={{
            width: "500px", height: "500px",
            bottom: "-100px", right: "-100px",
            background: "radial-gradient(circle, rgba(255,71,87,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="float-orb absolute rounded-full"
          style={{
            width: "300px", height: "300px",
            top: "40%", left: "50%",
            background: "radial-gradient(circle, rgba(255,215,0,0.04) 0%, transparent 70%)",
            animationDelay: "3s",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
        {/* Header */}
        <LiveTicker ticker={ticker} isLoading={isLoading} />

        {/* Main content */}
        <main className="flex-1 container py-4">
          {/* Error state */}
          {error && (
            <div
              className="glass-panel p-4 mb-4 flex items-center gap-3"
              style={{ border: "1px solid rgba(255,71,87,0.3)" }}
            >
              <AlertCircle size={16} style={{ color: "#ff4757", flexShrink: 0 }} />
              <span className="text-sm font-mono-data" style={{ color: "#ff4757" }}>
                {error} — retrying automatically
              </span>
              <RefreshCw size={14} className="ml-auto animate-spin" style={{ color: "#ff4757" }} />
            </div>
          )}

          {/* Loading skeleton */}
          {isLoading && !error && (
            <div className="space-y-4">
              <div className="glass-panel p-4 h-64 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="h-4 w-32 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-40 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-panel p-4 h-32 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
                ))}
              </div>
            </div>
          )}

          {/* Main dashboard grid */}
          {!isLoading && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left column — Chart + Window History */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {/* Chart card */}
                  <div className="glass-panel p-4" style={{ minHeight: "320px" }}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "#e8f4ff" }}>
                          BTC/USDT · 1m Candles
                        </div>
                        <div className="text-xs font-mono-data mt-0.5" style={{ color: "#556677" }}>
                          Last 30 minutes · 5-min windows highlighted
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono-data">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#00d4ff" }} />
                          <span style={{ color: "#556677" }}>Bullish</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#ff4757" }} />
                          <span style={{ color: "#556677" }}>Bearish</span>
                        </span>
                      </div>
                    </div>
                    <div style={{ height: "260px" }}>
                      <CandleChart
                        candles={candles}
                        currentWindow={currentWindow}
                        pastWindows={pastWindows}
                      />
                    </div>
                  </div>

                  {/* Window history */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#8899aa" }}>
                        Past Windows
                      </span>
                    </div>
                    <WindowHistory pastWindows={pastWindows} dbHistoryTotal={dbHistoryTotal} />
                  </div>
                </div>

                {/* Right column — Prediction + Cashout + Decision + AI + Stats */}
                <div className="lg:col-span-1 flex flex-col gap-3">
                  {/* Math prediction panel */}
                  <PredictionPanel
                    currentWindow={currentWindow}
                    windowProgress={windowProgress}
                    analysisProgress={analysisProgress}
                    isInAnalysisPhase={isInAnalysisPhase}
                    accuracy={accuracy}
                  />

                  {/* Live Signal Monitor / Cashout Guidance */}
                  <CashoutGuidance
                    currentWindow={currentWindow}
                    currentPrice={currentPrice}
                    windowProgress={windowProgress}
                  />

                  {/* Decision Engine — UP/DOWN/SKIP recommendation */}
                  <RecommendationEngine
                    currentWindow={currentWindow}
                    sessionStats={sessionStats}
                    aiPrediction={aiPrediction}
                    aiConfidence={aiConfidence}
                    aiRiskLevel={aiRiskLevel}
                  />

                  {/* AI Prediction Panel */}
                  <AIPredictionPanel
                    currentWindow={currentWindow}
                    isInAnalysisPhase={isInAnalysisPhase}
                    sessionAccuracy={accuracy}
                    onResult={(pred, conf, risk) => {
                      setAiPrediction(pred);
                      setAiConfidence(conf);
                      setAiRiskLevel(risk);
                    }}
                  />

                  {/* Session Stats */}
                  <SessionStatsPanel stats={sessionStats} />
                </div>
              </div>

              {/* Bottom section — ML Model, Pattern Controls, Scheduler */}
              <div className="mt-4">
                {/* Tab bar */}
                <div className="flex gap-1 mb-3">
                  {[
                    { id: "ml" as BottomTab, label: "ML Model", icon: <Brain size={12} />, color: "#a78bfa" },
                    { id: "patterns" as BottomTab, label: "Pattern Controls", icon: <Settings size={12} />, color: "#ffd700" },
                    { id: "scheduler" as BottomTab, label: "Scheduler", icon: <Clock size={12} />, color: "#00d4ff" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveBottomTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all"
                      style={{
                        background: activeBottomTab === tab.id ? `${tab.color}20` : "rgba(255,255,255,0.04)",
                        color: activeBottomTab === tab.id ? tab.color : "#445566",
                        border: `1px solid ${activeBottomTab === tab.id ? `${tab.color}40` : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {activeBottomTab === "ml" && (
                    <>
                      <div className="lg:col-span-1">
                        <MLModelPanel />
                      </div>
                      <div className="lg:col-span-2 glass-panel p-4">
                        <div className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: "#8899aa" }}>
                          How the ML Model Works
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            {
                              step: "01", color: "#a78bfa",
                              title: "Collect History",
                              desc: "After each 5-minute window closes, the model records the prediction, all 9 indicator values, and the actual outcome (UP/DOWN).",
                            },
                            {
                              step: "02", color: "#00d4ff",
                              title: "Learn from Failures",
                              desc: "Using gradient descent, the model adjusts indicator weights — boosting weights for indicators that correctly predicted outcomes, reducing weights for those that failed.",
                            },
                            {
                              step: "03", color: "#ffd700",
                              title: "Improve Over Time",
                              desc: "After each training round, the updated weights replace the default weights. The model continuously improves as more data accumulates.",
                            },
                          ].map((item) => (
                            <div key={item.step} className="flex flex-col gap-2">
                              <div
                                className="text-xs font-mono-data font-bold px-2 py-0.5 rounded w-fit"
                                style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                              >
                                {item.step}
                              </div>
                              <div className="text-sm font-semibold" style={{ color: "#e8f4ff" }}>{item.title}</div>
                              <div className="text-xs leading-relaxed" style={{ color: "#556677" }}>{item.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {activeBottomTab === "patterns" && (
                    <>
                      <div className="lg:col-span-1">
                        <PatternSettingsPanel />
                      </div>
                      <div className="lg:col-span-2 glass-panel p-4">
                        <div className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: "#8899aa" }}>
                          Pattern Descriptions
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { name: "Momentum", color: "#00d4ff", desc: "Measures overall price change from window open to current close. Strong positive momentum = bullish signal." },
                            { name: "Volume Delta", color: "#ffd700", desc: "Compares bullish vs bearish candle volume. High bull volume with price rise = strong confirmation." },
                            { name: "Price Velocity", color: "#a78bfa", desc: "Measures acceleration — is price speeding up or slowing down? Acceleration in direction = stronger signal." },
                            { name: "RSI (3-period)", color: "#ff4757", desc: "Relative Strength Index on 3 candles. >70 = overbought (bearish), <30 = oversold (bullish)." },
                            { name: "EMA Crossover", color: "#00d4ff", desc: "EMA(3) vs EMA(5) crossover. EMA3 above EMA5 = bullish momentum, below = bearish." },
                            { name: "Bollinger Bands", color: "#ffd700", desc: "Position within Bollinger Bands. Near upper band = overbought, near lower = oversold." },
                            { name: "VWAP Deviation", color: "#a78bfa", desc: "Distance from Volume-Weighted Average Price. Price above VWAP = bullish bias." },
                            { name: "Wick Bias", color: "#ff4757", desc: "Analyzes candle wicks. Long lower wicks = bullish rejection, long upper wicks = bearish rejection." },
                            { name: "Trend Strength", color: "#00d4ff", desc: "Consecutive candle streak in same direction. Longer streaks = stronger trend momentum." },
                          ].map((p) => (
                            <div key={p.name} className="flex gap-2">
                              <div className="w-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: p.color, height: "auto", minHeight: "12px" }} />
                              <div>
                                <div className="text-xs font-semibold mb-0.5" style={{ color: "#e8f4ff" }}>{p.name}</div>
                                <div className="text-xs leading-relaxed" style={{ color: "#556677" }}>{p.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {activeBottomTab === "scheduler" && (
                    <>
                      <div className="lg:col-span-1">
                        <SchedulerPanel />
                      </div>
                      <div className="lg:col-span-2 glass-panel p-4">
                        <div className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: "#8899aa" }}>
                          Background Scheduler
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            {
                              step: "01", color: "#00d4ff",
                              title: "Always Running",
                              desc: "The background scheduler runs on the server every 5 minutes — even when this page is closed or your browser is off.",
                            },
                            {
                              step: "02", color: "#ffd700",
                              title: "Fetches Live Data",
                              desc: "Each run fetches fresh BTC/USDT 1-minute candles from Kraken, applies all enabled prediction patterns, and stores the result in the database.",
                            },
                            {
                              step: "03", color: "#a78bfa",
                              title: "Stores History",
                              desc: "All scheduler predictions are saved with the ⚡ tag. When you open the app, you'll see the full history including predictions made while you were away.",
                            },
                          ].map((item) => (
                            <div key={item.step} className="flex flex-col gap-2">
                              <div
                                className="text-xs font-mono-data font-bold px-2 py-0.5 rounded w-fit"
                                style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                              >
                                {item.step}
                              </div>
                              <div className="text-sm font-semibold" style={{ color: "#e8f4ff" }}>{item.title}</div>
                              <div className="text-xs leading-relaxed" style={{ color: "#556677" }}>{item.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* How it works — info strip */}
          <div className="mt-4 glass-panel p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-center">
              {[
                {
                  step: "01", title: "3-Min Analysis", color: "#00d4ff",
                  desc: "First 3 minutes analyzed using 9 technical indicators: EMA, RSI, Bollinger Bands, VWAP, momentum, volume delta, velocity, wick bias, trend strength",
                },
                {
                  step: "02", title: "ML-Weighted Model", color: "#ffd700",
                  desc: "Self-learning ML model adjusts indicator weights based on historical accuracy. Weights improve automatically after each training round.",
                },
                {
                  step: "03", title: "AI Analysis", color: "#a78bfa",
                  desc: "AI independently analyzes all signals and provides a second opinion with risk assessment, supporting signals, and reasoning",
                },
                {
                  step: "04", title: "Live Monitor", color: "#ff4757",
                  desc: "Mid-window signal monitor tracks prediction confidence in real-time. Alerts you when to hold or cashout based on signal changes.",
                },
              ].map((item) => (
                <div key={item.step} className="flex flex-col items-center gap-2 py-2">
                  <div
                    className="text-xs font-mono-data font-bold px-2 py-0.5 rounded"
                    style={{ background: `${item.color}15`, color: item.color, border: `1px solid ${item.color}30` }}
                  >
                    {item.step}
                  </div>
                  <div className="text-sm font-semibold" style={{ color: "#e8f4ff" }}>{item.title}</div>
                  <div className="text-xs leading-relaxed" style={{ color: "#556677" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 pb-4 text-center">
            <p className="text-xs font-mono-data" style={{ color: "#334455" }}>
              Data from Kraken · For educational purposes only · Not financial advice · Past performance does not guarantee future results
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
