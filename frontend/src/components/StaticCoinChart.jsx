/**
 * StaticCoinChart — a self-contained candlestick-style price chart for
 * the admin-configured static coin.  Runs entirely client-side with no
 * external charting libraries.
 *
 * Behaviour
 * ─────────
 * • Seeds a synthetic OHLC history (200 candles) on first mount, using the
 *   same random-walk + centre-bias algorithm the backend oscillator uses, so
 *   the chart looks naturally connected to the live price.
 * • Appends a new candle every 20 s (matching the backend oscillator tick).
 * • The live price is overlaid as a horizontal dashed line.
 * • Time-frame buttons (1 m / 5 m / 15 m / 1 h) filter the visible window.
 * • Volume bars drawn beneath the price pane.
 * • Fully responsive — redraws on container resize.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import API_URL from '../config/api';
import axios from 'axios';

// ── constants ──────────────────────────────────────────────────────────────
const CANDLE_INTERVALS = {
  '1m':  { label: '1M',  ms: 60_000,      count: 120 },
  '5m':  { label: '5M',  ms: 300_000,     count: 96  },
  '15m': { label: '15M', ms: 900_000,     count: 96  },
  '1h':  { label: '1H',  ms: 3_600_000,   count: 72  },
};
const OSCILLATOR_MS = 20_000; // backend oscillator tick

// ── helpers ────────────────────────────────────────────────────────────────
const lerp     = (a, b, t) => a + (b - a) * t;
const clamp    = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmtPrice = (v) => v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(2);
const fmtTime  = (ts, intervalKey) => {
  const d = new Date(ts);
  if (intervalKey === '1h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Generate synthetic OHLC candles backwards from `currentPrice` so the
 * rightmost candle's close matches the live price.
 */
function seedCandles(currentPrice, minPrice, maxPrice, intervalMs, count) {
  const centre = (minPrice + maxPrice) / 2;
  const range  = maxPrice - minPrice;
  const candles = [];
  let price = currentPrice;
  const now = Date.now();

  // Build backwards; we'll reverse at the end.
  for (let i = 0; i < count; i++) {
    const tsClose = now - i * intervalMs;
    const tsOpen  = tsClose - intervalMs;

    // How many oscillator ticks fit in one candle?
    const ticks = Math.max(1, Math.round(intervalMs / OSCILLATOR_MS));

    let open = price;
    let high = price;
    let low  = price;
    let close = price;

    // Walk backwards `ticks` steps
    for (let t = 0; t < ticks; t++) {
      const bias  = ((centre - price) / range) * 0.002;
      const delta = price * ((Math.random() * 0.008 - 0.004) + bias);
      price = clamp(price + delta, minPrice, maxPrice);
      high  = Math.max(high, price);
      low   = Math.min(low, price);
      open  = price; // open walks back with us
    }

    const vol = Math.abs(high - low) * (0.5 + Math.random());
    candles.push({ ts: tsOpen, open, high, low, close, vol });
  }

  candles.reverse();
  return candles;
}

// ── drawing ────────────────────────────────────────────────────────────────
function drawChart(canvas, candles, livePrice, intervalKey, theme) {
  if (!canvas || candles.length === 0) return;
  const ctx    = canvas.getContext('2d');
  const W      = canvas.width;
  const H      = canvas.height;
  const VOLUME_H = Math.floor(H * 0.18);
  const PRICE_H  = H - VOLUME_H - 2;
  const PAD_L    = 8;
  const PAD_R    = 60;
  const PAD_T    = 12;
  const PAD_B    = 24;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  const n = candles.length;
  if (n === 0) return;

  const priceMin = Math.min(...candles.map(c => c.low))  * 0.998;
  const priceMax = Math.max(...candles.map(c => c.high)) * 1.002;
  const volMax   = Math.max(...candles.map(c => c.vol), 0.0001);

  const toX  = (i)  => PAD_L + (i / (n - 1 || 1)) * (W - PAD_L - PAD_R);
  const toY  = (p)  => PAD_T + (1 - (p - priceMin) / (priceMax - priceMin)) * (PRICE_H - PAD_T - PAD_B);
  const toVY = (v)  => PRICE_H + 2 + (1 - v / volMax) * (VOLUME_H - 4);

  const candleW = Math.max(2, Math.floor((W - PAD_L - PAD_R) / n) - 1);

  // ── Grid lines ──────────────────────────────────────────────────────────
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth   = 0.5;
  const gridRows = 5;
  for (let g = 0; g <= gridRows; g++) {
    const y = PAD_T + (g / gridRows) * (PRICE_H - PAD_T - PAD_B);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    const price = priceMax - (g / gridRows) * (priceMax - priceMin);
    ctx.fillStyle = theme.label;
    ctx.font      = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(fmtPrice(price), W - PAD_R + 4, y + 3);
  }

  // ── X-axis time labels ──────────────────────────────────────────────────
  const labelEvery = Math.max(1, Math.floor(n / 6));
  ctx.fillStyle = theme.label;
  ctx.font      = '9px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i += labelEvery) {
    const x = toX(i);
    ctx.fillText(fmtTime(candles[i].ts, intervalKey), x, H - 4);
  }

  // ── Volume bars ─────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const c    = candles[i];
    const x    = toX(i) - candleW / 2;
    const yTop = toVY(c.vol);
    const yBot = PRICE_H + VOLUME_H;
    ctx.fillStyle = c.close >= c.open ? theme.volBull : theme.volBear;
    ctx.fillRect(x, yTop, Math.max(1, candleW), yBot - yTop);
  }

  // ── Candles ─────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const c     = candles[i];
    const x     = toX(i);
    const isBull = c.close >= c.open;
    const col   = isBull ? theme.bull : theme.bear;

    // Wick
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x, toY(c.high));
    ctx.lineTo(x, toY(c.low));
    ctx.stroke();

    // Body
    const bodyTop = Math.min(toY(c.open), toY(c.close));
    const bodyBot = Math.max(toY(c.open), toY(c.close));
    const bodyH   = Math.max(1, bodyBot - bodyTop);
    ctx.fillStyle = col;
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }

  // ── Live-price line ──────────────────────────────────────────────────────
  if (livePrice != null && livePrice >= priceMin && livePrice <= priceMax) {
    const y = toY(livePrice);
    ctx.strokeStyle = theme.liveLine;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.setLineDash([]);

    // Price tag
    const tag = fmtPrice(livePrice);
    const tw  = ctx.measureText(tag).width + 8;
    ctx.fillStyle = theme.liveLine;
    ctx.fillRect(W - PAD_R + 1, y - 8, tw, 16);
    ctx.fillStyle = '#000';
    ctx.font      = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(tag, W - PAD_R + 5, y + 4);
  }
}

// ── component ──────────────────────────────────────────────────────────────
const THEME = {
  bg:      '#131722',
  grid:    '#1e2329',
  label:   '#4b5563',
  bull:    '#0ecb81',
  bear:    '#f6465d',
  volBull: 'rgba(14,203,129,0.25)',
  volBear: 'rgba(246,70,93,0.25)',
  liveLine:'#f0b90b',
};

const StaticCoinChart = ({ symbol, livePrice, minPrice, maxPrice }) => {
  const canvasRef   = useRef(null);
  const candlesRef  = useRef([]);
  const livePriceRef= useRef(livePrice);
  const intervalRef = useRef(null);
  const [intervalKey, setIntervalKey] = useState('5m');
  const [initialized, setInitialized] = useState(false);

  livePriceRef.current = livePrice;

  // ── Fetch live config + seed history ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/markets/static-coin`);
        if (cancelled) return;
        const cur = parseFloat(data.current_price);
        const mn  = parseFloat(data.min_price);
        const mx  = parseFloat(data.max_price);
        const cfg = CANDLE_INTERVALS[intervalKey];
        candlesRef.current = seedCandles(cur, mn, mx, cfg.ms, cfg.count);
        setInitialized(true);
      } catch {
        // fallback: seed with props
        if (!cancelled && livePrice && minPrice && maxPrice) {
          const cfg = CANDLE_INTERVALS[intervalKey];
          candlesRef.current = seedCandles(livePrice, minPrice, maxPrice, cfg.ms, cfg.count);
          setInitialized(true);
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalKey]);

  // ── Append new candle every 20 s (backend oscillator tick) ──────────────
  useEffect(() => {
    if (!initialized) return;
    const tick = () => {
      const price = livePriceRef.current;
      if (price == null) return;
      const candles = candlesRef.current;
      const cfg     = CANDLE_INTERVALS[intervalKey];
      const last    = candles[candles.length - 1];
      const now     = Date.now();

      if (last && now - last.ts < cfg.ms) {
        // Update current candle
        last.close = price;
        last.high  = Math.max(last.high, price);
        last.low   = Math.min(last.low,  price);
        last.vol   = Math.abs(last.high - last.low);
      } else {
        // New candle
        candles.push({ ts: now, open: price, high: price, low: price, close: price, vol: 0 });
        if (candles.length > cfg.count + 10) candles.splice(0, candles.length - cfg.count);
      }
      draw();
    };
    intervalRef.current = setInterval(tick, OSCILLATOR_MS);
    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, intervalKey]);

  // ── Draw ─────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cfg     = CANDLE_INTERVALS[intervalKey];
    const visible = candlesRef.current.slice(-cfg.count);
    drawChart(canvas, visible, livePriceRef.current, intervalKey, THEME);
  }, [intervalKey]);

  // Redraw when livePrice changes
  useEffect(() => { if (initialized) draw(); }, [livePrice, draw, initialized]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width  = width  * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const priceChange = (() => {
    const candles = candlesRef.current;
    if (candles.length < 2) return null;
    const first = candles[0].open;
    const last  = candles[candles.length - 1].close;
    return first > 0 ? ((last - first) / first) * 100 : null;
  })();

  return (
    <div className="w-full h-full flex flex-col bg-[#131722]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/avg-coin.svg" alt={symbol} className="w-5 h-5 rounded-full" />
          <span className="text-[#eaecef] text-sm font-bold">{symbol}/USDT</span>
          {livePrice != null && (
            <span className="text-[#eaecef] font-mono text-sm">${fmtPrice(livePrice)}</span>
          )}
          {priceChange != null && (
            <span className={`text-xs font-semibold ${priceChange >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Interval selector */}
        <div className="flex items-center gap-0.5">
          {Object.entries(CANDLE_INTERVALS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setIntervalKey(key)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                intervalKey === key
                  ? 'bg-[#f0b90b] text-black'
                  : 'text-[#848e9c] hover:text-[#eaecef]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
        {!initialized && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#f0b90b] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ display: initialized ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
};

export default StaticCoinChart;
