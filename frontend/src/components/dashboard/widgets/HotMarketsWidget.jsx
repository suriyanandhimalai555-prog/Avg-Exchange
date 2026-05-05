// frontend/src/components/dashboard/widgets/HotMarketsWidget.jsx
// Shows live Binance prices for the 4 most-traded pairs.
// Builds a rolling 20-point sparkline from buffered live ticks (real data).
//
// Props:
//   livePrices      {object} — { BTC: { price, change24h, ... }, ETH: ... }
//   coinGeckoPrices {object} — { BTC: { current_price, price_change_percentage_24h, ... } }
import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { LuFlame, LuTrendingUp, LuTrendingDown } from 'react-icons/lu';

const COINS = [
  { symbol: 'BTC',  name: 'Bitcoin',  pair: 'BTC/USDT', color: '#f7931a' },
  { symbol: 'ETH',  name: 'Ethereum', pair: 'ETH/USDT', color: '#627eea' },
  { symbol: 'SOL',  name: 'Solana',   pair: 'SOL/USDT', color: '#9945ff' },
  { symbol: 'BNB',  name: 'BNB',      pair: 'BNB/USDT', color: '#f3ba2f' },
];

// Static 24h change fallback until Binance ticker arrives
const STATIC_CHANGE = { BTC: 2.5, ETH: 1.2, SOL: 5.4, BNB: -0.5 };
const HISTORY_LEN = 20;

const CoinRow = ({ symbol, name, pair, color, liveData, cgData, historyRef }) => {
  const price  = liveData?.price    ?? cgData?.current_price  ?? 0;
  const change = liveData?.change24h ?? cgData?.price_change_percentage_24h ?? STATIC_CHANGE[symbol] ?? 0;
  const isPos  = change >= 0;
  const lineColor = isPos ? '#0ecb81' : '#f6465d';

  // Accumulate rolling price history
  const hist = historyRef.current;
  if (!hist[symbol]) hist[symbol] = [];
  if (price > 0) {
    const arr = hist[symbol];
    if (!arr.length || arr[arr.length - 1].v !== price) {
      arr.push({ v: price });
      if (arr.length > HISTORY_LEN) arr.shift();
    }
  }
  // Need ≥2 points for AreaChart.
  // Always use a shallow copy so recharts never freezes our mutable hist array.
  const spark = hist[symbol]?.length > 1
    ? [...hist[symbol]]
    : [{ v: price || 1 }, { v: price || 1 }];

  const fmtPrice = (p) => {
    if (!p) return '—';
    if (p >= 1000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1)     return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return p.toFixed(6);
  };

  return (
    <Link
      to={`/trade?pair=${encodeURIComponent(pair)}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#2b3139] transition-colors group"
    >
      {/* Coin avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-md"
        style={{ background: color }}
      >
        {symbol.slice(0, 2)}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[#eaecef] leading-none">{symbol}<span className="text-[#848e9c] font-normal">/USDT</span></div>
        <div className="text-[11px] text-[#848e9c] mt-0.5">{name}</div>
      </div>

      {/* Mini sparkline (real-time accumulation) */}
      <div className="w-14 h-8 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id={`hg-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={lineColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={lineColor}
              strokeWidth={1.5}
              fill={`url(#hg-${symbol})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Price & change */}
      <div className="text-right shrink-0 w-24">
        <div className="text-sm font-bold font-mono text-[#eaecef] leading-none">
          ${fmtPrice(price)}
        </div>
        <div className={`flex items-center justify-end gap-0.5 text-[11px] font-semibold mt-0.5
          ${isPos ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
          {isPos ? <LuTrendingUp size={10} /> : <LuTrendingDown size={10} />}
          {isPos ? '+' : ''}{(+change).toFixed(2)}%
        </div>
      </div>
    </Link>
  );
};

const HotMarketsWidget = ({ livePrices, coinGeckoPrices }) => {
  // Shared mutable ref for rolling histories — does NOT cause re-renders
  const historyRef = useRef({});

  return (
    <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <LuFlame size={15} className="text-[#f0b90b]" />
          <span className="text-xs font-semibold text-[#848e9c] uppercase tracking-widest">
            Hot Markets
          </span>
        </div>
        <Link to="/markets" className="text-[11px] font-semibold text-[#f0b90b] hover:text-[#d4a300] transition-colors">
          View all →
        </Link>
      </div>

      {/* Coin rows */}
      <div className="flex flex-col gap-0.5">
        {COINS.map(c => (
          <CoinRow
            key={c.symbol}
            {...c}
            liveData={livePrices?.[c.symbol]}
            cgData={coinGeckoPrices?.[c.symbol]}
            historyRef={historyRef}
          />
        ))}
      </div>
    </div>
  );
};

export default HotMarketsWidget;
