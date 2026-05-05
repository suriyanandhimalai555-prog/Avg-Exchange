// frontend/src/components/dashboard/widgets/EstimatedBalanceWidget.jsx
// Props:
//   totalUSD  {number}   — total portfolio value in USD
//   btcPrice  {number}   — current BTC/USD price for BTC-equivalent display
//   loading   {boolean}
//   onDeposit {function} — opens deposit modal
//   onRefresh {function} — re-fetches data
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LuEye, LuEyeOff,
  LuRefreshCw, LuArrowUpRight, LuChartBar, LuArrowLeftRight,
} from 'react-icons/lu';

const EstimatedBalanceWidget = ({ totalUSD, btcPrice, loading, onDeposit, onRefresh }) => {
  const [hidden, setHidden] = useState(false);
  const mask = (v) => (hidden ? '•••••••' : v);

  const btcEq = btcPrice > 0 ? (totalUSD ?? 0) / btcPrice : 0;

  return (
    <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex flex-col gap-4 h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#848e9c] uppercase tracking-widest">
          Estimated Balance
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            title="Refresh"
            className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors"
          >
            <LuRefreshCw size={13} />
          </button>
          <button
            onClick={() => setHidden(h => !h)}
            title={hidden ? 'Show balance' : 'Hide balance'}
            className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors"
          >
            {hidden ? <LuEyeOff size={13} /> : <LuEye size={13} />}
          </button>
        </div>
      </div>

      {/* ── Balance ── */}
      <div className="flex-1 min-w-0">
        {loading ? (
          <>
            <div className="h-9 w-48 bg-[#2b3139] rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-36 bg-[#2b3139] rounded animate-pulse" />
          </>
        ) : (
          <>
            {/* USD value */}
            <div className="flex items-baseline gap-2 flex-wrap mb-1">
              <span className="text-3xl font-bold text-[#eaecef] font-mono tracking-tight leading-none">
                {mask('$' + (totalUSD ?? 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }))}
              </span>
              <span className="text-[#848e9c] text-sm font-medium">USD</span>
            </div>

            {/* BTC equivalent */}
            <p className="text-sm text-[#848e9c] font-mono">
              {mask(`≈ ${btcEq.toFixed(6)} BTC`)}
            </p>
          </>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="flex items-center gap-2 pt-3 border-t border-[#2b3139] flex-wrap">
        <button
          onClick={onDeposit}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#f0b90b] hover:bg-[#d4a300]
                     text-black font-bold text-xs rounded-lg transition-colors active:scale-[0.98]"
        >
          <LuArrowUpRight size={13} />
          Deposit
        </button>
        <Link
          to="/wallet"
          className="flex items-center gap-1.5 px-4 py-2 bg-[#2b3139] hover:bg-[#363c45]
                     text-[#eaecef] font-semibold text-xs rounded-lg border border-[#363c45]
                     transition-colors"
        >
          <LuChartBar size={13} />
          Portfolio
        </Link>
        <Link
          to="/trade"
          className="flex items-center gap-1.5 px-4 py-2 bg-[#2b3139] hover:bg-[#363c45]
                     text-[#eaecef] font-semibold text-xs rounded-lg border border-[#363c45]
                     transition-colors"
        >
          <LuArrowLeftRight size={13} />
          Trade
        </Link>
      </div>
    </div>
  );
};

export default EstimatedBalanceWidget;
