/**
 * Home — Main page for CryptoOracle BTC Predictor
 * Design: Glassmorphic Night Sky
 * Layout: Full-height app shell, sticky header, responsive grid (chart + prediction panel)
 * Mobile: Single column, chart first, prediction panel below
 */

import CandleChart from "@/components/CandleChart";
import LiveTicker from "@/components/LiveTicker";
import PredictionPanel from "@/components/PredictionPanel";
import WindowHistory from "@/components/WindowHistory";
import { useBitcoinData } from "@/hooks/useBitcoinData";
import { AlertCircle, RefreshCw } from "lucide-react";

const BG_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663482996437/g7kKL6GCFpLYNEHMGxFTYy/crypto-bg-fPiZmNZE5QfZGj8Bnsoa8f.webp";

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
  } = useBitcoinData();

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
            width: "600px",
            height: "600px",
            top: "-200px",
            left: "-150px",
            background: "radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="float-orb-slow absolute rounded-full"
          style={{
            width: "500px",
            height: "500px",
            bottom: "-100px",
            right: "-100px",
            background: "radial-gradient(circle, rgba(255,71,87,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          className="float-orb absolute rounded-full"
          style={{
            width: "300px",
            height: "300px",
            top: "40%",
            left: "50%",
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Chart — takes 2/3 on desktop */}
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
                    <div className="flex items-center gap-4 text-xs font-mono-data" style={{ color: "#445566" }}>
                      <span>Prediction</span>
                      <span>Actual</span>
                      <span>Conf</span>
                      <span>✓</span>
                    </div>
                  </div>
                  <WindowHistory pastWindows={pastWindows} />
                </div>
              </div>

              {/* Prediction panel — 1/3 on desktop, full width on mobile */}
              <div className="lg:col-span-1">
                <PredictionPanel
                  currentWindow={currentWindow}
                  windowProgress={windowProgress}
                  analysisProgress={analysisProgress}
                  isInAnalysisPhase={isInAnalysisPhase}
                  accuracy={accuracy}
                />
              </div>
            </div>
          )}

          {/* How it works — info strip */}
          <div className="mt-4 glass-panel p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              {[
                {
                  step: "01",
                  title: "3-Min Analysis",
                  desc: "First 3 minutes of each 5-min window are analyzed for momentum, volume, and velocity signals",
                  color: "#00d4ff",
                },
                {
                  step: "02",
                  title: "Trend Prediction",
                  desc: "Algorithm predicts UP or DOWN for the remaining 2 minutes based on weighted signal composite",
                  color: "#ffd700",
                },
                {
                  step: "03",
                  title: "Result Tracking",
                  desc: "Each prediction is verified at window close and accuracy is tracked across all sessions",
                  color: "#ff4757",
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
              Data from Binance · For educational purposes only · Not financial advice
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
