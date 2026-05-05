// frontend/src/components/dashboard/widgets/AssetBreakdownWidget.jsx
// Props:
//   balances {object} — { SYMBOL: { available, locked } }
//   prices   {object} — { SYMBOL: number (USD price) }
//   loading  {boolean}
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { LuChartPie } from 'react-icons/lu';

const COIN_COLORS = {
  BTC:   '#f7931a',
  ETH:   '#627eea',
  USDT:  '#26a17b',
  BNB:   '#f3ba2f',
  SOL:   '#9945ff',
  XRP:   '#00aae4',
  ADA:   '#0d4c91',
  DOGE:  '#c2a633',
  AVAX:  '#e84142',
  MATIC: '#8247e5',
  DOT:   '#e6007a',
  LINK:  '#2a5ada',
  ATOM:  '#2e3148',
  LTC:   '#bfbbbb',
  TON:   '#0088cc',
};
const FALLBACK_COLOR = '#4b5563';

const PieTooltip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#2b3139] border border-[#363c45] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-bold text-[#eaecef] mb-0.5">{d.symbol}</p>
      <p className="text-[#848e9c] font-mono">
        ${d.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
      <p className="text-[#f0b90b] font-semibold">
        {total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0'}%
      </p>
    </div>
  );
};

const AssetBreakdownWidget = ({ balances, prices, loading }) => {
  const { entries, total, available, locked } = useMemo(() => {
    let avail = 0;
    let lock  = 0;
    const list = Object.entries(balances)
      .map(([symbol, { available: a, locked: l }]) => {
        const price = prices[symbol] ?? 0;
        const value = (a + l) * price;
        avail += a * price;
        lock  += l * price;
        return { symbol, value };
      })
      .filter(d => d.value > 0.01)
      .sort((a, b) => b.value - a.value);

    const tot = list.reduce((s, d) => s + d.value, 0);
    return { entries: list, total: tot, available: avail, locked: lock };
  }, [balances, prices]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 h-full flex flex-col gap-4">
        <div className="h-3 w-32 bg-[#2b3139] rounded animate-pulse" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-28 h-28 rounded-full border-[6px] border-[#2b3139] animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 bg-[#2b3139] rounded animate-pulse" style={{ width: `${70 - i * 12}%` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty state ──
  if (entries.length === 0) {
    return (
      <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 h-full flex flex-col">
        <span className="text-xs font-semibold text-[#848e9c] uppercase tracking-widest mb-4">
          Asset Allocation
        </span>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <LuChartPie size={40} className="text-[#2b3139]" />
          <p className="text-[#eaecef] text-sm font-semibold">No assets yet</p>
          <p className="text-[#848e9c] text-xs">Deposit funds to see your allocation</p>
        </div>
      </div>
    );
  }

  const fmt = (v) => '$' + v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex flex-col gap-4 h-full">

      {/* Header */}
      <span className="text-xs font-semibold text-[#848e9c] uppercase tracking-widest">
        Asset Allocation
      </span>

      {/* Donut + legend row */}
      <div className="flex items-center gap-5 flex-1">

        {/* Donut chart */}
        <div className="relative w-28 h-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={entries}
                dataKey="value"
                nameKey="symbol"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={54}
                paddingAngle={2}
                strokeWidth={2}
                stroke="#1e2329"
                startAngle={90}
                endAngle={-270}
              >
                {entries.map((d) => (
                  <Cell
                    key={d.symbol}
                    fill={COIN_COLORS[d.symbol] ?? FALLBACK_COLOR}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] text-[#848e9c] font-medium">Total</span>
            <span className="text-xs font-bold text-[#eaecef] font-mono leading-tight">
              ${total >= 1000
                ? (total / 1000).toFixed(1) + 'K'
                : total.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Legend bars */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {entries.slice(0, 6).map(d => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            const col = COIN_COLORS[d.symbol] ?? FALLBACK_COLOR;
            return (
              <div key={d.symbol} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                <span className="text-xs font-semibold text-[#eaecef] w-10 shrink-0">{d.symbol}</span>
                <div className="flex-1 h-1 bg-[#2b3139] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(pct, 2)}%`, background: col }}
                  />
                </div>
                <span className="text-[11px] text-[#848e9c] w-10 text-right shrink-0 font-mono">
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available vs Locked split */}
      <div className="pt-3 border-t border-[#2b3139] grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-[#848e9c] mb-0.5">Total</p>
          <p className="text-xs font-bold text-[#eaecef] font-mono">{fmt(total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#848e9c] mb-0.5">Available</p>
          <p className="text-xs font-bold text-[#0ecb81] font-mono">{fmt(available)}</p>
        </div>
        <div>
          <p className="text-[10px] text-[#848e9c] mb-0.5">In Orders</p>
          <p className="text-xs font-bold text-[#f0b90b] font-mono">{fmt(locked)}</p>
        </div>
      </div>
    </div>
  );
};

export default AssetBreakdownWidget;
