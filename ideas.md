# CryptoOracle Design Ideas

## Idea 1 — Terminal Noir
**Design Movement:** Cyberpunk Terminal / Dark Data Dashboard
**Core Principles:** Monospace data density, neon accent on pitch black, scanline texture, raw information hierarchy
**Color Philosophy:** Near-black (#0a0a0f) base, electric green (#00ff88) for bullish signals, crimson (#ff2d55) for bearish, amber (#f5a623) for neutral/pending. Colors carry meaning, not decoration.
**Layout Paradigm:** Full-bleed dark canvas. Header strip with live ticker. Main split: left 60% chart, right 40% prediction panel stacked vertically. Mobile collapses to single column with sticky prediction bar at bottom.
**Signature Elements:** Monospace font for all numbers, subtle scanline CSS overlay, pulsing dot for live data, blinking cursor on active prediction
**Interaction Philosophy:** Every data update triggers a micro-flash. Prediction confidence shown as a filling progress bar. Hover reveals raw OHLCV data.
**Animation:** Number counters animate on update, prediction bar fills left-to-right over 3-minute window, result flash on window close
**Typography:** JetBrains Mono for data, Inter for labels
<probability>0.07</probability>

## Idea 2 — Bloomberg Terminal Reborn
**Design Movement:** Financial Data Brutalism / Information Architecture
**Core Principles:** Dense but readable, orange-on-dark accent palette, strict grid, zero decorative elements
**Color Philosophy:** Deep navy (#0d1b2a) background, Bloomberg orange (#ff6600) for primary actions and live indicators, white for data, muted slate for secondary info
**Layout Paradigm:** Asymmetric split dashboard — narrow left sidebar for controls/stats, wide right panel for chart. Prediction zone is a persistent bottom drawer on mobile.
**Signature Elements:** Thick left border accent on active panels, uppercase monospace labels, live price ticker scrolling in header
**Interaction Philosophy:** Keyboard-first feel, instant feedback, no animations except data updates
**Animation:** Subtle slide-in for new candles, flash on price change, smooth gauge needle for sentiment
**Typography:** Space Mono for numbers, IBM Plex Sans for UI labels
<probability>0.06</probability>

## Idea 3 — Glassmorphic Night Sky (CHOSEN)
**Design Movement:** Modern Glassmorphism / Dark Luxury Dashboard
**Core Principles:** Frosted glass panels over deep space gradient, luminous accents, breathing animations, premium data visualization
**Color Philosophy:** Deep space gradient (#050b1a → #0d1f3c) as base. Electric cyan (#00d4ff) for bullish. Hot coral (#ff4757) for bearish. Gold (#ffd700) for prediction confidence. Glass panels with 10-15% white opacity and backdrop blur.
**Layout Paradigm:** Full-height app shell. Top nav with live price ticker. Below: responsive CSS Grid — chart takes 2/3 width, prediction panel 1/3. On mobile: stacked single column, chart first, prediction panel below with sticky bottom action bar.
**Signature Elements:** Glass card panels with blur + border glow, animated gradient orbs in background, neon glow on active indicators
**Interaction Philosophy:** Smooth transitions everywhere, prediction confidence fills like a liquid gauge, result revealed with a satisfying pop animation
**Animation:** Background orbs slowly drift, candles animate in, prediction meter fills over 3 minutes, result badge bounces in
**Typography:** Outfit (display/headings) + JetBrains Mono (all numbers/data)
<probability>0.09</probability>
