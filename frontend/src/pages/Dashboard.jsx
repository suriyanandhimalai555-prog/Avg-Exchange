// frontend/src/pages/Dashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import axios from 'axios';
import { io } from 'socket.io-client';
import { LuArrowUpRight } from 'react-icons/lu';

import API_URL from '../config/api';
import { fetchNavbarBalance } from '../features/balanceSlice';
import { STATIC_COINS } from '../constants/tokens';

import DepositModal         from '../components/dashboard/DepositModal';
import EstimatedBalanceWidget from '../components/dashboard/widgets/EstimatedBalanceWidget';
import AssetBreakdownWidget   from '../components/dashboard/widgets/AssetBreakdownWidget';
import HotMarketsWidget       from '../components/dashboard/widgets/HotMarketsWidget';
import QuickStatsWidget       from '../components/dashboard/widgets/QuickStatsWidget';
import RecentActivityWidget   from '../components/dashboard/widgets/RecentActivityWidget';

const STATIC_PRICE_MAP = (() => {
  const m = { USDT: 1 };
  for (const c of STATIC_COINS) m[c.symbol.toUpperCase()] = c.current_price;
  return m;
})();

const STATIC_CG_MAP = Object.fromEntries(
  STATIC_COINS.map(c => [c.symbol.toUpperCase(), c])
);

const Dashboard = () => {
  const user     = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();

  const [depositOpen, setDepositOpen] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [balances,   setBalances]   = useState({});
  const [prices,     setPrices]     = useState(STATIC_PRICE_MAP);
  const [orders,     setOrders]     = useState([]);
  const [trades,     setTrades]     = useState([]);
  const [livePrices, setLivePrices] = useState({});

  const pendingRef = useRef({});

  const fetchData = useCallback(async () => {
    try {
      const [balRes, ordRes, trdRes] = await Promise.all([
        axios.get(`${API_URL}/api/user/balance`, { withCredentials: true }),
        axios.get(`${API_URL}/api/trade/orders`, { withCredentials: true }),
        axios.get(`${API_URL}/api/trade/trades`, { withCredentials: true }),
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
      for (const c of data) map[c.symbol.toUpperCase()] = c.current_price ?? 0;
      setPrices(map);
    } catch (_) {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), fetchPrices()]).finally(() => setLoading(false));
  }, [fetchData, fetchPrices]);

  useEffect(() => {
    const id = setInterval(() => {
      const snap = pendingRef.current;
      if (!Object.keys(snap).length) return;
      pendingRef.current = {};
      setLivePrices(prev => ({ ...prev, ...snap }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const socket = io(API_URL, { withCredentials: true });
    socket.on('connect', () => socket.emit('subscribe', { userId: user.id }));
    socket.on('balance_update', () => { fetchData(); dispatch(fetchNavbarBalance()); });
    socket.on('binance:ticker', (data) => { if (data?.symbol) pendingRef.current[data.symbol] = data; });
    return () => socket.disconnect();
  }, [user?.id, fetchData, dispatch]);

  const mergedPrices = {
    ...prices,
    ...Object.fromEntries(
      Object.entries(livePrices).map(([sym, d]) => [sym, d.price ?? prices[sym]])
    ),
  };

  const totalUSD = Object.entries(balances).reduce((sum, [cur, { available, locked }]) => {
    return sum + (available + locked) * (mergedPrices[cur] ?? 0);
  }, 0);

  const btcPrice = mergedPrices['BTC'] ?? 0;
  const openOrderCount  = orders.filter(o => o.status === 'open' || o.status === 'partially_filled').length;
  const totalTradeCount = trades.length;

  const MS_24H = 86_400_000;
  const totalVolumeUSD = trades
    .filter(t => Date.now() - new Date(t.executed_at).getTime() < MS_24H)
    .reduce((s, t) => s + parseFloat(t.price) * parseFloat(t.quantity), 0);

  const kycLevel = user?.kycStatus === 'approved' ? 'Verified' : 'Basic';

  const handleDeposit = async (currency, amount) => {
    const { data } = await axios.post(
      `${API_URL}/api/user/deposit`,
      { currency, amount },
      { withCredentials: true }
    );
    fetchData();
    dispatch(fetchNavbarBalance());
    return data;
  };

  const handleRefresh = useCallback(() => {
    fetchData();
    fetchPrices();
  }, [fetchData, fetchPrices]);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || user?.email || 'Trader').split(/[@\s]/)[0];

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

        {/* Welcome + deposit button */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#eaecef]">
              {greeting}, <span className="capitalize">{firstName}</span>
            </h1>
            <p className="text-[#848e9c] text-sm mt-0.5">Here's your portfolio overview for today.</p>
          </div>
          <button
            onClick={() => setDepositOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#f0b90b] hover:bg-[#d4a300] text-black font-bold text-sm rounded-lg transition-colors active:scale-[0.98]"
          >
            <LuArrowUpRight size={15} />
            Deposit
          </button>
        </div>

        {/* Row 1: Balance (7/12) + Asset breakdown (5/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <EstimatedBalanceWidget
              totalUSD={totalUSD}
              btcPrice={btcPrice}
              loading={loading}
              onDeposit={() => setDepositOpen(true)}
              onRefresh={handleRefresh}
            />
          </div>
          <div className="lg:col-span-5">
            <AssetBreakdownWidget
              balances={balances}
              prices={mergedPrices}
              loading={loading}
            />
          </div>
        </div>

        {/* Row 2: Hot markets (5/12) + Quick stats (7/12) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <HotMarketsWidget
              livePrices={livePrices}
              coinGeckoPrices={STATIC_CG_MAP}
            />
          </div>
          <div className="lg:col-span-7">
            <QuickStatsWidget
              openOrderCount={openOrderCount}
              totalTradeCount={totalTradeCount}
              totalVolumeUSD={totalVolumeUSD}
              kycLevel={kycLevel}
            />
          </div>
        </div>

        {/* Row 3: Recent activity full width */}
        <RecentActivityWidget
          orders={orders}
          trades={trades}
          userId={user?.id}
          onRefresh={fetchData}
        />

      </div>

      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        onSuccess={handleDeposit}
      />
    </div>
  );
};

export default Dashboard;
