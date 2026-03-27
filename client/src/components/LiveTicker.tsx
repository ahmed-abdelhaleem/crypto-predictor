/**
 * LiveTicker — Top header with live BTC price and 24h stats
 * Design: Glassmorphic Night Sky — glass strip, pulsing live dot, mono data
 */

import { LiveTicker as LiveTickerData } from "@/hooks/useBitcoinData";
import { Bitcoin } from "lucide-react";

interface LiveTickerProps {
  ticker: LiveTickerData | null;
  isLoading: boolean;
}

export default function LiveTicker({ ticker, isLoading }: LiveTickerProps) {
  const isPositive = (ticker?.priceChangePct24h ?? 0) >= 0;
  const changeColor = isPositive ? "#00d4ff" : "#ff4757";

  const fmt = (n: number | null | undefined, decimals = 2) => {
    if (n === null || n === undefined) return "—";
    return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <header
      className="glass-panel-bright sticky top-0 z-50"
      style={{
        borderRadius: "0",
        borderLeft: "none",
        borderRight: "none",
        borderTop: "none",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(5, 11, 26, 0.85)",
      }}
    >
      <div className="container">
        <div className="flex items-center gap-3 py-3 min-h-[56px]">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #00d4ff20, #00d4ff40)", border: "1px solid #00d4ff40" }}
            >
              <Bitcoin size={16} style={{ color: "#00d4ff" }} />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-tight" style={{ fontFamily: "Outfit, sans-serif", color: "#e8f4ff" }}>
                CryptoOracle
              </div>
              <div className="text-xs" style={{ color: "#445566", fontFamily: "JetBrains Mono, monospace" }}>
                BTC/USDT
              </div>
            </div>
          </div>

          {/* Live dot */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className="w-2 h-2 rounded-full pulse-live"
              style={{ background: isLoading ? "#ffd700" : "#00d4ff", boxShadow: `0 0 6px ${isLoading ? "#ffd700" : "#00d4ff"}` }}
            />
            <span className="text-xs font-mono-data hidden sm:block" style={{ color: "#556677" }}>
              {isLoading ? "Loading" : "LIVE"}
            </span>
          </div>

          {/* Price */}
          <div className="flex-1 flex items-baseline gap-2 overflow-hidden">
            {isLoading ? (
              <div className="h-6 w-32 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
            ) : (
              <>
                <span
                  className="text-xl sm:text-2xl font-bold font-mono-data truncate"
                  style={{ color: "#e8f4ff", fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.02em" }}
                >
                  ${ticker ? fmt(ticker.price) : "—"}
                </span>
                <span
                  className="text-sm font-mono-data font-medium flex-shrink-0"
                  style={{ color: changeColor }}
                >
                  {ticker ? `${isPositive ? "+" : ""}${fmt(ticker.priceChangePct24h)}%` : ""}
                </span>
              </>
            )}
          </div>

          {/* 24h stats — hidden on mobile */}
          <div className="hidden md:flex items-center gap-4 flex-shrink-0">
            {[
              { label: "24H High", value: ticker && ticker.high24h ? `$${fmt(ticker.high24h)}` : "—", color: "#00d4ff" },
              { label: "24H Low", value: ticker && ticker.low24h ? `$${fmt(ticker.low24h)}` : "—", color: "#ff4757" },
              { label: "Volume", value: ticker ? `${(ticker.volume24h / 1000).toFixed(1)}K BTC` : "—", color: "#8899aa" },
            ].map((stat) => (
              <div key={stat.label} className="text-right">
                <div className="text-xs" style={{ color: "#445566", fontFamily: "JetBrains Mono, monospace" }}>
                  {stat.label}
                </div>
                <div className="text-xs font-medium font-mono-data" style={{ color: stat.color, fontFamily: "JetBrains Mono, monospace" }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* 24h change badge — visible on mobile */}
          {ticker && (
            <div
              className="md:hidden flex-shrink-0 px-2 py-1 rounded-lg text-xs font-mono-data font-semibold"
              style={{
                background: `${changeColor}20`,
                color: changeColor,
                border: `1px solid ${changeColor}30`,
              }}
            >
              {isPositive ? "+" : ""}{fmt(ticker.priceChangePct24h)}%
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
