import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchNavbarBalance } from '../features/balanceSlice';
import axios from 'axios';
import { io } from 'socket.io-client';
import {
  IoWalletOutline, IoAddCircleOutline, IoSwapHorizontalOutline,
  IoCloseOutline, IoCheckmarkCircleOutline, IoAlertCircleOutline,
  IoArrowDownOutline, IoTimeOutline, IoBarChartOutline,
  IoEyeOutline, IoEyeOffOutline, IoRefreshOutline,
} from 'react-icons/io5';
import API_URL from '../config/api';

const SUPPORTED_COINS = [
  { symbol: 'USDT', name: 'Tether',          color: '#26a17b' },
  { symbol: 'BTC',  name: 'Bitcoin',          color: '#f7931a' },
  { symbol: 'ETH',  name: 'Ethereum',         color: '#627eea' },
  { symbol: 'BNB',  name: 'BNB',              color: '#f3ba2f' },
  { symbol: 'SOL',  name: 'Solana',           color: '#9945ff' },
  { symbol: 'XRP',  name: 'XRP',              color: '#00aae4' },
  { symbol: 'ADA',  name: 'Cardano',          color: '#0d4c91' },
  { symbol: 'DOGE', name: 'Dogecoin',         color: '#c2a633' },
  { symbol: 'AVAX', name: 'Avalanche',        color: '#e84142' },
  { symbol: 'MATIC',name: 'Polygon',          color: '#8247e5' },
];

const TABS = ['Assets', 'Open Orders', 'Trade History'];

const Wallet = () => {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [activeTab,   setActiveTab]   = useState('Assets');
  const [balances,    setBalances]    = useState({});
  const [orders,      setOrders]      = useState([]);
  const [trades,      setTrades]      = useState([]);
  const [prices,      setPrices]      = useState({});    // { BTC: 76000, ETH: 3400, ... }
  const [loading,     setLoading]     = useState(true);
  const [hideBalance, setHideBalance] = useState(false);

  // Deposit modal
  const [depositOpen,     setDepositOpen]     = useState(false);
  const [depositCoin,     setDepositCoin]     = useState('USDT');
  const [depositAmount,   setDepositAmount]   = useState('');
  const [depositLoading,  setDepositLoading]  = useState(false);
  const [depositFeedback, setDepositFeedback] = useState(null); // { type, message }

  // Cancel order
  const [cancellingId, setCancellingId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [balRes, ordRes, trdRes] = await Promise.all([
        axios.get(`${API_URL}/api/user/balance`,  { withCredentials: true }),
        axios.get(`${API_URL}/api/trade/orders`,  { withCredentials: true }),
        axios.get(`${API_URL}/api/trade/trades`,  { withCredentials: true }),
      ]);
      setBalances(balRes.data ?? {});
      setOrders(ordRes.data   ?? []);
      setTrades(trdRes.data   ?? []);
    } catch (_) {}
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/markets`, {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
      });
      const map = { USDT: 1 };
      for (const coin of data) map[coin.symbol.toUpperCase()] = coin.current_price ?? 0;
      setPrices(map);
    } catch (_) { setPrices({ USDT: 1 }); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAll(), fetchPrices()]).finally(() => setLoading(false));
  }, [fetchAll, fetchPrices]);

  // Real-time balance + order updates via socket
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(API_URL, { withCredentials: true });

    socket.on('connect', () => {
      socket.emit('subscribe', { userId: user.id });
    });

    // Any trade that involves this user → refresh balances and orders
    socket.on('balance_update', () => {
      fetchAll();
    });

    return () => socket.disconnect();
  }, [user?.id, fetchAll]);

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositLoading(true);
    setDepositFeedback(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/user/deposit`,
        { currency: depositCoin, amount },
        { withCredentials: true }
      );
      setDepositFeedback({
        type: 'success',
        message: `${data.credited.toLocaleString()} ${data.currency} credited to your account`,
      });
      setDepositAmount('');
      fetchAll();
      dispatch(fetchNavbarBalance());
    } catch (err) {
      setDepositFeedback({ type: 'error', message: err.response?.data?.error || 'Deposit failed' });
    } finally {
      setDepositLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    setCancellingId(orderId);
    try {
      await axios.delete(`${API_URL}/api/trade/order/${orderId}`, { withCredentials: true });
      fetchAll();
    } catch (_) {}
    finally { setCancellingId(null); }
  };

  const openDepositFor = (symbol) => {
    setDepositCoin(symbol);
    setDepositAmount('');
    setDepositFeedback(null);
    setDepositOpen(true);
  };

  // Portfolio value calculation
  const totalUSDT = Object.entries(balances).reduce((sum, [cur, { available, locked }]) => {
    const price = prices[cur] ?? 0;
    return sum + (available + locked) * price;
  }, 0);

  // Build the rows: show coins with balance first, then supported coins with 0
  const coinRows = (() => {
    const rows = [];
    const seen = new Set();

    for (const [symbol, { available, locked }] of Object.entries(balances)) {
      seen.add(symbol);
      rows.push({ symbol, available, locked });
    }
    for (const { symbol } of SUPPORTED_COINS) {
      if (!seen.has(symbol)) rows.push({ symbol, available: 0, locked: 0 });
    }
    // Sort: non-zero balances first, then alphabetically
    rows.sort((a, b) => {
      const aHas = a.available + a.locked > 0;
      const bHas = b.available + b.locked > 0;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
    return rows;
  })();

  const openOrders   = orders.filter(o => o.status === 'open' || o.status === 'partially_filled');
  const filledOrders = orders.filter(o => o.status === 'filled' || o.status === 'cancelled');
  const mask = (v) => hideBalance ? '****' : v;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f0b90b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef] pb-16">

      {/* ── PORTFOLIO HEADER ── */}
      <div className="bg-[#1e2329] border-b border-[#2b3139]">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">

            <div>
              <div className="flex items-center gap-2 mb-1">
                <IoWalletOutline className="text-[#f0b90b]" size={20} />
                <span className="text-[#848e9c] text-sm font-semibold uppercase tracking-wide">Estimated Balance</span>
                <button
                  onClick={() => setHideBalance(h => !h)}
                  className="text-[#848e9c] hover:text-[#eaecef] transition-colors"
                >
                  {hideBalance ? <IoEyeOffOutline size={16} /> : <IoEyeOutline size={16} />}
                </button>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-[#eaecef] font-mono">
                  {hideBalance ? '****' : totalUSDT.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="text-[#848e9c] text-lg">USDT</span>
              </div>
              <p className="text-[#848e9c] text-xs mt-1">Testnet — virtual funds for demo purposes</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => openDepositFor('USDT')}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#f0b90b] hover:bg-[#d4a300] text-black font-bold text-sm rounded transition-colors active:scale-[0.98]"
              >
                <IoAddCircleOutline size={18} /> Deposit
              </button>
              <button
                onClick={() => navigate('/trade')}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#2b3139] hover:bg-[#363c45] text-[#eaecef] font-bold text-sm rounded border border-[#363c45] transition-colors"
              >
                <IoSwapHorizontalOutline size={18} /> Trade
              </button>
              <button
                onClick={() => { fetchAll(); fetchPrices(); }}
                className="p-2.5 bg-[#2b3139] hover:bg-[#363c45] text-[#848e9c] hover:text-[#eaecef] rounded border border-[#363c45] transition-colors"
                title="Refresh"
              >
                <IoRefreshOutline size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex border-b border-[#2b3139] mt-6 gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#f0b90b] text-[#f0b90b]'
                  : 'border-transparent text-[#848e9c] hover:text-[#eaecef]'
              }`}
            >
              {tab}
              {tab === 'Open Orders' && openOrders.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-[#f0b90b]/20 text-[#f0b90b] text-[10px] font-bold rounded">
                  {openOrders.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── ASSETS TAB ── */}
        {activeTab === 'Assets' && (
          <div className="mt-6">
            {/* Hide zero balances toggle */}
            <div className="overflow-x-auto rounded-lg border border-[#2b3139]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e2329] text-[#848e9c] text-xs uppercase tracking-wide">
                    <th className="text-left px-5 py-3 font-semibold">Coin</th>
                    <th className="text-right px-5 py-3 font-semibold">Available</th>
                    <th className="text-right px-5 py-3 font-semibold">In Orders</th>
                    <th className="text-right px-5 py-3 font-semibold">Total</th>
                    <th className="text-right px-5 py-3 font-semibold">≈ USDT Value</th>
                    <th className="text-right px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2b3139]">
                  {coinRows.map(({ symbol, available, locked }) => {
                    const total     = available + locked;
                    const price     = prices[symbol] ?? 0;
                    const usdtValue = total * price;
                    const meta      = SUPPORTED_COINS.find(c => c.symbol === symbol);
                    const isEmpty   = total === 0;

                    return (
                      <tr
                        key={symbol}
                        className={`transition-colors ${isEmpty ? 'opacity-40' : 'hover:bg-[#1e2329]'}`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                              style={{ background: meta?.color ?? '#848e9c' }}
                            >
                              {symbol.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-[#eaecef]">{symbol}</div>
                              <div className="text-[10px] text-[#848e9c]">{meta?.name ?? symbol}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-[#eaecef]">
                          {mask(available.toLocaleString(undefined, { maximumFractionDigits: symbol === 'USDT' ? 2 : 6 }))}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-[#848e9c]">
                          {mask(locked.toLocaleString(undefined, { maximumFractionDigits: symbol === 'USDT' ? 2 : 6 }))}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-[#eaecef] font-semibold">
                          {mask(total.toLocaleString(undefined, { maximumFractionDigits: symbol === 'USDT' ? 2 : 6 }))}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-[#848e9c]">
                          {mask('$' + usdtValue.toLocaleString(undefined, { maximumFractionDigits: 2 }))}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openDepositFor(symbol)}
                              className="px-3 py-1 text-[11px] font-semibold text-[#f0b90b] border border-[#f0b90b]/30 rounded hover:bg-[#f0b90b]/10 transition-colors"
                            >
                              Deposit
                            </button>
                            {symbol !== 'USDT' && (
                              <Link
                                to="/trade"
                                className="px-3 py-1 text-[11px] font-semibold text-[#848e9c] border border-[#363c45] rounded hover:border-[#eaecef] hover:text-[#eaecef] transition-colors"
                              >
                                Trade
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── OPEN ORDERS TAB ── */}
        {activeTab === 'Open Orders' && (
          <div className="mt-6">
            {openOrders.length === 0 ? (
              <EmptyState icon={<IoTimeOutline size={32} />} text="No open orders" sub="Orders you place will appear here until filled or cancelled." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#2b3139]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1e2329] text-[#848e9c] text-xs uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-semibold">Pair</th>
                      <th className="text-left px-5 py-3 font-semibold">Side</th>
                      <th className="text-right px-5 py-3 font-semibold">Price</th>
                      <th className="text-right px-5 py-3 font-semibold">Amount</th>
                      <th className="text-right px-5 py-3 font-semibold">Filled</th>
                      <th className="text-right px-5 py-3 font-semibold">Status</th>
                      <th className="text-right px-5 py-3 font-semibold">Date</th>
                      <th className="text-right px-5 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2b3139]">
                    {openOrders.map(order => {
                      const filledQty = parseFloat(order.quantity) - parseFloat(order.remaining_quantity);
                      const fillPct   = (filledQty / parseFloat(order.quantity) * 100).toFixed(0);
                      return (
                        <tr key={order.id} className="hover:bg-[#1e2329] transition-colors">
                          <td className="px-5 py-3 font-bold text-[#eaecef]">{order.pair}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${order.side === 'buy' ? 'text-[#0ecb81] bg-[#0ecb81]/10' : 'text-[#f6465d] bg-[#f6465d]/10'}`}>
                              {order.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">${parseFloat(order.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">{parseFloat(order.quantity).toFixed(6)}</td>
                          <td className="px-5 py-3 text-right font-mono text-[#848e9c]">{fillPct}%</td>
                          <td className="px-5 py-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold text-yellow-400 bg-yellow-400/10">
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-[#848e9c] text-xs">
                            {new Date(order.created_at).toLocaleString()}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={cancellingId === order.id}
                              className="px-3 py-1 text-[11px] font-semibold text-[#f6465d] border border-[#f6465d]/30 rounded hover:bg-[#f6465d]/10 disabled:opacity-40 transition-colors"
                            >
                              {cancellingId === order.id ? '…' : 'Cancel'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Recent cancelled/filled orders */}
            {filledOrders.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[#848e9c] text-xs uppercase font-semibold tracking-wide mb-3">Recent History</h3>
                <div className="overflow-x-auto rounded-lg border border-[#2b3139]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1e2329] text-[#848e9c] text-xs uppercase tracking-wide">
                        <th className="text-left px-5 py-3 font-semibold">Pair</th>
                        <th className="text-left px-5 py-3 font-semibold">Side</th>
                        <th className="text-right px-5 py-3 font-semibold">Price</th>
                        <th className="text-right px-5 py-3 font-semibold">Amount</th>
                        <th className="text-right px-5 py-3 font-semibold">Status</th>
                        <th className="text-right px-5 py-3 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2b3139]">
                      {filledOrders.slice(0, 10).map(order => (
                        <tr key={order.id} className="opacity-60 hover:opacity-100 transition-opacity">
                          <td className="px-5 py-3 font-bold text-[#eaecef]">{order.pair}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${order.side === 'buy' ? 'text-[#0ecb81] bg-[#0ecb81]/10' : 'text-[#f6465d] bg-[#f6465d]/10'}`}>
                              {order.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">${parseFloat(order.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">{parseFloat(order.quantity).toFixed(6)}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${order.status === 'filled' ? 'text-[#0ecb81] bg-[#0ecb81]/10' : 'text-[#848e9c] bg-[#848e9c]/10'}`}>
                              {order.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-[#848e9c] text-xs">
                            {new Date(order.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TRADE HISTORY TAB ── */}
        {activeTab === 'Trade History' && (
          <div className="mt-6">
            {trades.length === 0 ? (
              <EmptyState icon={<IoBarChartOutline size={32} />} text="No trades yet" sub="Completed trades will appear here once your orders are matched." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#2b3139]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1e2329] text-[#848e9c] text-xs uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-semibold">Pair</th>
                      <th className="text-left px-5 py-3 font-semibold">Role</th>
                      <th className="text-right px-5 py-3 font-semibold">Price</th>
                      <th className="text-right px-5 py-3 font-semibold">Quantity</th>
                      <th className="text-right px-5 py-3 font-semibold">Total (USDT)</th>
                      <th className="text-right px-5 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2b3139]">
                    {trades.map(trade => {
                      const isBuyer = trade.buyer_id === user?.id;
                      const total   = parseFloat(trade.price) * parseFloat(trade.quantity);
                      return (
                        <tr key={trade.id} className="hover:bg-[#1e2329] transition-colors">
                          <td className="px-5 py-3 font-bold text-[#eaecef]">{trade.pair}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isBuyer ? 'text-[#0ecb81] bg-[#0ecb81]/10' : 'text-[#f6465d] bg-[#f6465d]/10'}`}>
                              {isBuyer ? 'BUY' : 'SELL'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">${parseFloat(trade.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-right font-mono text-[#eaecef]">{parseFloat(trade.quantity).toFixed(6)}</td>
                          <td className="px-5 py-3 text-right font-mono text-[#f0b90b] font-semibold">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-5 py-3 text-right text-[#848e9c] text-xs">
                            {new Date(trade.executed_at).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DEPOSIT MODAL ── */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDepositOpen(false)} />
          <div className="relative w-full max-w-md bg-[#1e2329] border border-[#2b3139] rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139]">
              <div className="flex items-center gap-3">
                <IoArrowDownOutline className="text-[#f0b90b]" size={20} />
                <h2 className="font-bold text-[#eaecef]">Deposit Funds</h2>
              </div>
              <button onClick={() => setDepositOpen(false)} className="text-[#848e9c] hover:text-[#eaecef] transition-colors">
                <IoCloseOutline size={22} />
              </button>
            </div>

            <form onSubmit={handleDeposit} className="px-6 py-5 flex flex-col gap-4">
              {/* Testnet notice */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-lg">
                <IoAlertCircleOutline className="text-[#f0b90b] shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-[#848e9c]">
                  This is a <strong className="text-[#f0b90b]">testnet exchange</strong>. Deposited funds are virtual and have no real value.
                </p>
              </div>

              {/* Currency selector */}
              <div>
                <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wide mb-2">Select Coin</label>
                <div className="grid grid-cols-5 gap-2">
                  {SUPPORTED_COINS.map(({ symbol, color }) => (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => setDepositCoin(symbol)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                        depositCoin === symbol
                          ? 'border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]'
                          : 'border-[#363c45] bg-[#2b3139] text-[#848e9c] hover:border-[#848e9c]'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: color }}>
                        {symbol.slice(0, 2)}
                      </div>
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick amount buttons */}
              <div>
                <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wide mb-2">Amount</label>
                <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded-lg flex items-center px-4 py-3 transition-colors mb-2">
                  <input
                    type="number"
                    required
                    min="0.000001"
                    step="any"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="bg-transparent text-[#eaecef] text-base w-full outline-none font-mono placeholder-[#848e9c]"
                  />
                  <span className="text-[#848e9c] text-sm font-bold pl-3 shrink-0">{depositCoin}</span>
                </div>

                {/* Quick-fill buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {(depositCoin === 'USDT'
                    ? [1000, 5000, 10000, 50000]
                    : depositCoin === 'BTC'
                    ? [0.01, 0.1, 1, 10]
                    : [0.1, 1, 10, 100]
                  ).map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(String(amt))}
                      className="py-1.5 text-xs font-semibold text-[#848e9c] border border-[#363c45] rounded hover:border-[#f0b90b] hover:text-[#f0b90b] bg-[#2b3139] transition-colors"
                    >
                      {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback */}
              {depositFeedback && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                  depositFeedback.type === 'success'
                    ? 'bg-[#0ecb81]/10 border border-[#0ecb81]/20 text-[#0ecb81]'
                    : 'bg-[#f6465d]/10 border border-[#f6465d]/20 text-[#f6465d]'
                }`}>
                  {depositFeedback.type === 'success'
                    ? <IoCheckmarkCircleOutline size={18} />
                    : <IoAlertCircleOutline size={18} />}
                  {depositFeedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={depositLoading || !depositAmount}
                className="w-full py-3 bg-[#f0b90b] hover:bg-[#d4a300] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors active:scale-[0.98]"
              >
                {depositLoading ? 'Processing…' : `Deposit ${depositCoin}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ icon, text, sub }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-14 h-14 rounded-full bg-[#2b3139] flex items-center justify-center text-[#848e9c] mb-4">
      {icon}
    </div>
    <p className="text-[#eaecef] font-semibold mb-1">{text}</p>
    <p className="text-[#848e9c] text-sm max-w-xs">{sub}</p>
  </div>
);

export default Wallet;
