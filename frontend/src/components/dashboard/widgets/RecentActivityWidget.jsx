// frontend/src/components/dashboard/widgets/RecentActivityWidget.jsx
// Tabbed table: Open Orders | Trade History
// Props:
//   orders    {array}    — all orders for this user
//   trades    {array}    — all trades for this user
//   userId    {number}   — to determine buy/sell role in a trade
//   onRefresh {function} — called after cancel so parent re-fetches
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../../../config/api';
import { LuExternalLink } from 'react-icons/lu';

const TABS = ['Open Orders', 'Trade History'];

// ── Badge components ──────────────────────────────────────────────────────
const SideBadge = ({ side }) => (
  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold
    ${side === 'buy'
      ? 'text-[#0ecb81] bg-[#0ecb81]/10'
      : 'text-[#f6465d] bg-[#f6465d]/10'}`}>
    {side.toUpperCase()}
  </span>
);

const StatusBadge = ({ status }) => {
  const map = {
    open:             'text-[#f0b90b]  bg-[#f0b90b]/10',
    partially_filled: 'text-[#627eea]  bg-[#627eea]/10',
    filled:           'text-[#0ecb81]  bg-[#0ecb81]/10',
    cancelled:        'text-[#848e9c]  bg-[#2b3139]',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${map[status] ?? map.open}`}>
      {status.replace('_', ' ').toUpperCase()}
    </span>
  );
};

const Th = ({ children, right }) => (
  <th className={`px-4 py-3 text-[10px] font-semibold text-[#848e9c] uppercase tracking-wider
    ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

const EmptyRow = ({ message }) => (
  <tr>
    <td colSpan={99} className="text-center py-14 text-[#848e9c] text-sm">
      {message}
    </td>
  </tr>
);

// ── Main component ────────────────────────────────────────────────────────
const RecentActivityWidget = ({ orders, trades, userId, onRefresh }) => {
  const [activeTab,    setActiveTab]    = useState('Open Orders');
  const [cancellingId, setCancellingId] = useState(null);

  const openOrders = orders.filter(o => o.status === 'open' || o.status === 'partially_filled');

  const handleCancel = async (id) => {
    setCancellingId(id);
    try {
      await axios.delete(`${API_URL}/api/trade/order/${id}`, { withCredentials: true });
      onRefresh?.();
    } catch (_) { /* silently ignore */ }
    finally { setCancellingId(null); }
  };

  return (
    <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl flex flex-col">

      {/* ── Tab header ── */}
      <div className="flex items-center justify-between px-5 border-b border-[#2b3139]">
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors -mb-px
                ${activeTab === t
                  ? 'border-[#f0b90b] text-[#f0b90b]'
                  : 'border-transparent text-[#848e9c] hover:text-[#eaecef]'}`}
            >
              {t}
              {t === 'Open Orders' && openOrders.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-[#f0b90b]/15 text-[#f0b90b] text-[9px] font-bold rounded-full">
                  {openOrders.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <Link
          to="/wallet"
          className="flex items-center gap-1 text-[11px] font-semibold text-[#f0b90b] hover:text-[#d4a300] transition-colors"
        >
          View all <LuExternalLink size={11} />
        </Link>
      </div>

      {/* ── Open Orders table ── */}
      {activeTab === 'Open Orders' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-[#181b22]">
              <tr>
                <Th>Pair</Th>
                <Th>Side</Th>
                <Th right>Price (USDT)</Th>
                <Th right>Amount</Th>
                <Th right>Filled</Th>
                <Th right>Status</Th>
                <Th right>Date</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2b3139]">
              {openOrders.length === 0 ? (
                <EmptyRow message="No open orders — place a limit order to see it here" />
              ) : (
                openOrders.slice(0, 8).map(o => {
                  const filled  = parseFloat(o.quantity) - parseFloat(o.remaining_quantity);
                  const fillPct = parseFloat(o.quantity) > 0
                    ? ((filled / parseFloat(o.quantity)) * 100).toFixed(0)
                    : '0';
                  return (
                    <tr key={o.id} className="hover:bg-[#2b3139]/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#eaecef]">{o.pair}</td>
                      <td className="px-4 py-3"><SideBadge side={o.side} /></td>
                      <td className="px-4 py-3 text-right font-mono text-[#eaecef]">
                        {parseFloat(o.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#eaecef]">
                        {parseFloat(o.quantity).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1 bg-[#2b3139] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#f0b90b] rounded-full transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-[#848e9c] text-xs w-7 text-right">{fillPct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-[#848e9c] text-xs whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleCancel(o.id)}
                          disabled={cancellingId === o.id}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#f6465d]
                                     border border-[#f6465d]/30 rounded-lg
                                     hover:bg-[#f6465d]/10 disabled:opacity-40
                                     transition-colors"
                        >
                          {cancellingId === o.id ? '…' : 'Cancel'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Trade History table ── */}
      {activeTab === 'Trade History' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-[#181b22]">
              <tr>
                <Th>Pair</Th>
                <Th>Role</Th>
                <Th right>Price (USDT)</Th>
                <Th right>Quantity</Th>
                <Th right>Total</Th>
                <Th right>Date</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2b3139]">
              {trades.length === 0 ? (
                <EmptyRow message="No trades yet — matched orders will appear here" />
              ) : (
                trades.slice(0, 8).map(t => {
                  const isBuyer = t.buyer_id === userId;
                  const total   = parseFloat(t.price) * parseFloat(t.quantity);
                  return (
                    <tr key={t.id} className="hover:bg-[#2b3139]/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#eaecef]">{t.pair}</td>
                      <td className="px-4 py-3"><SideBadge side={isBuyer ? 'buy' : 'sell'} /></td>
                      <td className="px-4 py-3 text-right font-mono text-[#eaecef]">
                        {parseFloat(t.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#eaecef]">
                        {parseFloat(t.quantity).toFixed(6)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-[#f0b90b]">
                        ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-[#848e9c] text-xs whitespace-nowrap">
                        {new Date(t.executed_at).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecentActivityWidget;
