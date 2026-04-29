// frontend/src/pages/Trade.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { IoSearch, IoRefreshOutline } from 'react-icons/io5';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import API_URL from '../config/api';
import TradingViewChart from '../components/TradingViewChart';
import { STATIC_COINS } from '../constants/tokens';
import useTradeSocket from '../hooks/useTradeSocket';

const MAX_ROWS = 12; // rows per side in order book
const ROW_H    = 22; // px — fixed row height

// --- ORDER BOOK ROW ---
const ObRow = ({ o, side }) => {
  const isAsk = side === 'ask';
  if (!o) return <div style={{ height: ROW_H }} />;
  const w = Math.min((o.amount / Math.max(o.amount, 1)) * 60, 60); // relative width capped
  return (
    <div
      className={`flex text-xs px-3 relative cursor-pointer group hover:bg-[#2b3139]`}
      style={{ height: ROW_H }}
    >
      <div
        className={`absolute inset-y-0 right-0 z-0 ${isAsk ? 'bg-[#f6465d]/10' : 'bg-[#0ecb81]/10'}`}
        style={{ width: `${w}%` }}
      />
      <span className={`flex-1 z-10 font-mono flex items-center ${isAsk ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>
        {o.price.toFixed(4)}
      </span>
      <span className="flex-1 text-right z-10 font-mono text-[#eaecef] flex items-center justify-end">
        {o.amount.toFixed(4)}
      </span>
      <span className="flex-1 text-right z-10 font-mono text-[#eaecef] opacity-50 group-hover:opacity-100 flex items-center justify-end">
        {(o.price * o.amount).toFixed(2)}
      </span>
    </div>
  );
};

// --- MAIN COMPONENT ---
const Trade = () => {
  const { user } = useSelector((state) => state.auth);

  const [selectedCoin, setSelectedCoin] = useState({ symbol: 'BTC' });
  const [marketList,   setMarketList]   = useState([]);
  const [search,       setSearch]       = useState('');
  const [bids,         setBids]         = useState([]);
  const [asks,         setAsks]         = useState([]);
  const [loadingBook,  setLoadingBook]  = useState(false);
  const [inputPrice,   setInputPrice]   = useState('');
  const [inputAmount,  setInputAmount]  = useState('');
  const [sellAmount,   setSellAmount]   = useState('');
  const [balances,     setBalances]     = useState({});        // { USDT: { available, locked }, BTC: {...} }
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState(null);   // { type: 'success'|'error', message }
  const [buyOrderType,  setBuyOrderType]  = useState('limit'); // 'limit' | 'market'
  const [sellOrderType, setSellOrderType] = useState('limit');

  // Use a ref so fetchOrderBook can always access latest selectedCoin
  const selectedCoinRef = useRef(selectedCoin);
  useEffect(() => { selectedCoinRef.current = selectedCoin; }, [selectedCoin]);

  // When market order is selected (either side), auto-fill price with current market price.
  // Also refresh price if the selected coin changes while market order is active.
  useEffect(() => {
    const mktObj = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol) || {};
    const price  = mktObj.current_price;
    if (!price) return;
    if (buyOrderType  === 'market') setInputPrice(String(price));
    if (sellOrderType === 'market') setInputPrice(String(price));
  }, [buyOrderType, sellOrderType, selectedCoin, marketList]);

  // FETCH MARKETS (via backend proxy, with static fallback if API is unavailable)
  useEffect(() => {
    axios.get(`${API_URL}/api/markets`, {
      params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
    })
    .then(({ data }) => {
      setMarketList(data);
    })
    .catch(() => {
      setMarketList(prevList => prevList.length > 0 ? prevList : STATIC_COINS);
    });
  }, []);

  // FETCH ORDER BOOK — uses the exchange's own internal order book
  const fetchOrderBook = useCallback(async () => {
    const coin = selectedCoinRef.current;
    const pair = `${coin.symbol}/USDT`;
    try {
      setLoadingBook(true);
      const { data } = await axios.get(`${API_URL}/api/trade/orderbook`, {
        params: { pair },
      });
      setAsks((data.asks || []).slice(0, MAX_ROWS));
      setBids((data.bids || []).slice(0, MAX_ROWS));
    } catch {
      setAsks([]); setBids([]);
    } finally {
      setLoadingBook(false);
    }
  }, []);

  // Initial load only — socket keeps it live after that
  useEffect(() => {
    setLoadingBook(true);
    fetchOrderBook();
  }, [selectedCoin, fetchOrderBook]);

  // FETCH BALANCES
  const fetchBalances = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/user/balance`, { withCredentials: true });
      setBalances(data);
    } catch (_) {}
  }, [user]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // REAL-TIME UPDATES via WebSocket
  useTradeSocket({
    pair:            `${selectedCoin.symbol}/USDT`,
    userId:          user?.id,
    onDepthUpdate:   ({ asks, bids }) => {
      setAsks(asks.slice(0, MAX_ROWS));
      setBids(bids.slice(0, MAX_ROWS));
    },
    onBalanceUpdate: fetchBalances,
    onReconnect:     fetchOrderBook,
  });

  // PLACE ORDER
  const handlePlaceOrder = async (side) => {
    const qty = side === 'buy' ? inputAmount : sellAmount;
    if (!inputPrice || !qty) return;
    setOrderLoading(true);
    setOrderFeedback(null);
    try {
      const orderType = side === 'buy' ? buyOrderType : sellOrderType;
      const { data } = await axios.post(
        `${API_URL}/api/trade/order`,
        { pair: `${selectedCoin.symbol}/USDT`, side, type: orderType, price: parseFloat(inputPrice), quantity: parseFloat(qty) },
        { withCredentials: true }
      );
      const filled = data.executedTrades?.length ?? 0;
      setOrderFeedback({
        type: 'success',
        message: filled > 0
          ? `Order filled — ${filled} trade${filled > 1 ? 's' : ''} executed`
          : 'Order placed — waiting for a match',
      });
      setInputAmount(''); setSellAmount(''); setInputPrice('');
      fetchBalances();
    } catch (err) {
      setOrderFeedback({ type: 'error', message: err.response?.data?.error || 'Order failed' });
    } finally {
      setOrderLoading(false);
      setTimeout(() => setOrderFeedback(null), 5000);
    }
  };

  // % SHORTCUTS
  const handleBuyPercent = (pct) => {
    const available = balances.USDT?.available ?? 0;
    if (!inputPrice || !available) return;
    setInputAmount(((available * pct / 100) / parseFloat(inputPrice)).toFixed(6));
  };
  const handleSellPercent = (pct) => {
    const available = balances[selectedCoin.symbol]?.available ?? 0;
    if (!available) return;
    setSellAmount(((available * pct) / 100).toFixed(6));
  };

  // HANDLERS
  const handleCoinClick = (coin) => {
    const symbol = coin.symbol.toUpperCase();
    setSelectedCoin({ symbol });
    setBuyOrderType('limit'); setSellOrderType('limit');
    setInputPrice(''); setInputAmount(''); setSellAmount('');
    if (symbol === selectedCoinRef.current.symbol) {
      fetchOrderBook();
    }
  };

  // DERIVED STATE
  const filteredCoins = marketList.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );
  const mkt = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol) || {};
  const up  = (mkt.price_change_percentage_24h ?? 0) >= 0;
  const buyTotal  = inputPrice && inputAmount ? (parseFloat(inputPrice) * parseFloat(inputAmount)).toFixed(2) : '0';
  const sellTotal = inputPrice && sellAmount  ? (parseFloat(inputPrice) * parseFloat(sellAmount)).toFixed(2)  : '0';
  const usdtAvail = (balances.USDT?.available ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const coinAvail = (balances[selectedCoin.symbol]?.available ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

  // FIX 2 & 3: Orderbook Display Logic
  const askCount = Math.min(asks.length, MAX_ROWS);
  const askSlots = Array.from({ length: MAX_ROWS }, (_, i) => {
    const emptyCount = MAX_ROWS - askCount;
    if (i < emptyCount) return null; // These create the "space at the top" to align asks to the bottom
    
    // Reverses the index so the lowest price is physically at the bottom of the list!
    const askIdx = MAX_ROWS - 1 - i; 
    return asks[askIdx];
  });
  
  const bidSlots = Array.from({ length: MAX_ROWS }, (_, i) => bids[i] ?? null);
  
  const isEmpty = !loadingBook && asks.length === 0 && bids.length === 0;

  const PANEL_H = 'lg:h-[800px]';

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef] flex flex-col pt-4 pb-8 font-sans">

      {/* MOBILE TICKER */}
      <div className="lg:hidden p-4 border-b border-[#2b3139] flex items-center justify-between bg-[#1e2329]">
        <div className="flex items-center gap-2">
          {mkt.image && <img src={mkt.image} alt="" className="w-6 h-6 rounded-full" />}
          <span className="text-lg font-bold">{selectedCoin.symbol}/USDT</span>
        </div>
        <span className={up ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
          {mkt.price_change_percentage_24h?.toFixed(2)}%
        </span>
      </div>

      {/* DESKTOP TICKER BAR */}
      <div className="hidden lg:flex items-center gap-6 px-4 py-2 bg-[#1e2329] border-b border-[#2b3139] text-xs overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          {mkt.image && <img src={mkt.image} alt="" className="w-5 h-5 rounded-full" />}
          <span className="font-bold text-sm">
            {selectedCoin.symbol}<span className="text-[#848e9c] font-normal">/USDT</span>
          </span>
        </div>
        <span className={`font-bold text-base shrink-0 ${up ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
          ${mkt.current_price?.toLocaleString() ?? '—'}
        </span>
        {[
          ['24h Change', `${up ? '+' : ''}${mkt.price_change_percentage_24h?.toFixed(2)}%`, up],
          ['24h High',   `$${mkt.high_24h?.toLocaleString() ?? '—'}`,  null],
          ['24h Low',    `$${mkt.low_24h?.toLocaleString() ?? '—'}`,   null],
          ['Volume',     mkt.total_volume ? `$${(mkt.total_volume / 1e9).toFixed(2)}B` : '—', null],
        ].map(([label, val, colored]) => (
          <div key={label} className="flex flex-col shrink-0">
            <span className="text-[#848e9c] text-[10px]">{label}</span>
            <span className={
              colored === true  ? 'text-[#0ecb81] font-semibold' :
              colored === false ? 'text-[#f6465d] font-semibold' :
                                  'text-[#eaecef] font-semibold'
            }>{val}</span>
          </div>
        ))}
      </div>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 p-2 max-w-[1600px] mx-auto w-full">

        {/* ── LEFT: ORDER BOOK ── */}
        <div className={`order-4 lg:order-1 lg:col-span-3 bg-[#1e2329] rounded-sm flex flex-col overflow-hidden border border-[#2b3139] min-h-[400px] ${PANEL_H}`}>
          <div className="flex items-center px-3 py-2 border-b border-[#2b3139] shrink-0">
            <span className="flex-1 text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Price (USDT)</span>
            <span className="flex-1 text-right text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Amount</span>
            <div className="flex-1 flex items-center justify-end gap-2">
              <span className="text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Total</span>
              <button onClick={fetchOrderBook} className={`text-[#848e9c] hover:text-[#eaecef] transition-colors ${loadingBook ? 'animate-spin' : ''}`} title="Refresh orderbook">
                <IoRefreshOutline size={12} />
              </button>
            </div>
          </div>

          {loadingBook ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-[#2b3139] border-t-[#848e9c] rounded-full animate-spin" />
              <span className="text-[#848e9c] text-xs">Loading orders...</span>
            </div>
          ) : isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-[#2b3139] flex items-center justify-center text-lg">📋</div>
              <p className="text-[#eaecef] text-xs font-semibold">No open limit orders</p>
              <button onClick={fetchOrderBook} className="text-[10px] px-3 py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#f0b90b] hover:text-[#f0b90b] bg-[#2b3139] transition-colors">
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="shrink-0">{askSlots.map((o, i) => <ObRow key={i} o={o} side="ask" />)}</div>
              <div className="px-3 py-2 border-y border-[#2b3139] flex items-center justify-between bg-[#0b0e11] shrink-0">
                <span className={`text-sm font-bold ${up ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                  ${mkt.current_price?.toLocaleString() || '---'}
                </span>
                <span className="text-[10px] text-[#848e9c]">≈ ${mkt.current_price?.toLocaleString()}</span>
              </div>
              <div className="shrink-0">{bidSlots.map((o, i) => <ObRow key={i} o={o} side="bid" />)}</div>
            </>
          )}
        </div>

        {/* ── CENTER: CHART + FORM ── */}
        <div className={`order-1 lg:order-2 lg:col-span-6 flex flex-col gap-2 min-h-0 ${PANEL_H}`}>
          <div className="h-[320px] lg:h-auto lg:flex-1 lg:min-h-0 bg-[#1e2329] rounded-sm border border-[#2b3139] overflow-hidden">
            <TradingViewChart symbol={`BINANCE:${selectedCoin.symbol}USDT`} />
          </div>

          <div className="shrink-0 bg-[#1e2329] rounded-sm border border-[#2b3139] p-4">
            {orderFeedback && (
              <div className={`mb-3 px-3 py-2 rounded text-xs font-semibold ${orderFeedback.type === 'success' ? 'bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/30' : 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/30'}`}>
                {orderFeedback.message}
              </div>
            )}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* BUY SIDE */}
              <div className="flex-1 flex flex-col gap-2.5">
                <h3 className="text-[#0ecb81] font-bold text-sm">Buy {selectedCoin.symbol}</h3>
                <div className="relative">
                  <select
                    value={buyOrderType}
                    onChange={e => {
                      const t = e.target.value;
                      setBuyOrderType(t);
                      if (t === 'market') {
                        const price = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol)?.current_price;
                        if (price) setInputPrice(String(price));
                      }
                    }}
                    className="w-full bg-[#2b3139] border border-[#363c45] text-[#eaecef] text-sm rounded px-3 py-2 appearance-none outline-none focus:border-[#f0b90b] cursor-pointer transition-colors"
                  >
                    <option value="limit">Limit Order</option>
                    <option value="market">Market Order</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] text-[10px]">▼</span>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">
                    Price
                    {buyOrderType === 'market' && <span className="ml-1.5 text-[#f0b90b] font-semibold">— Market</span>}
                  </label>
                  <div className={`bg-[#2b3139] border rounded flex items-center px-3 py-1.5 transition-colors ${buyOrderType === 'market' ? 'border-[#f0b90b]/40 opacity-70' : 'border-[#363c45] focus-within:border-[#f0b90b]'}`}>
                    <input
                      type="number"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={inputPrice}
                      readOnly={buyOrderType === 'market'}
                      onChange={e => buyOrderType === 'limit' && setInputPrice(e.target.value)}
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Amount</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input type="number" className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]" placeholder="0.00" value={inputAmount} onChange={e => setInputAmount(e.target.value)} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">{selectedCoin.symbol}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => handleBuyPercent(p)} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#0ecb81] hover:text-[#0ecb81] bg-[#2b3139] transition-colors">{p}%</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Total</label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={buyTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#0ecb81] text-[10px] font-medium">Available: {usdtAvail} USDT</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : (
                  <button onClick={() => handlePlaceOrder('buy')} disabled={orderLoading || !inputPrice || !inputAmount} className="w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">
                    {orderLoading ? 'Placing…' : `Buy ${selectedCoin.symbol}`}
                  </button>
                )}
              </div>

              <div className="hidden lg:block w-px bg-[#2b3139] self-stretch" />

              {/* SELL SIDE */}
              <div className="flex-1 flex flex-col gap-2.5">
                <h3 className="text-[#f6465d] font-bold text-sm">Sell {selectedCoin.symbol}</h3>
                <div className="relative">
                  <select
                    value={sellOrderType}
                    onChange={e => {
                      const t = e.target.value;
                      setSellOrderType(t);
                      if (t === 'market') {
                        const price = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol)?.current_price;
                        if (price) setInputPrice(String(price));
                      }
                    }}
                    className="w-full bg-[#2b3139] border border-[#363c45] text-[#eaecef] text-sm rounded px-3 py-2 appearance-none outline-none focus:border-[#f0b90b] cursor-pointer transition-colors"
                  >
                    <option value="limit">Limit Order</option>
                    <option value="market">Market Order</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] text-[10px]">▼</span>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">
                    Price
                    {sellOrderType === 'market' && <span className="ml-1.5 text-[#f0b90b] font-semibold">— Market</span>}
                  </label>
                  <div className={`bg-[#2b3139] border rounded flex items-center px-3 py-1.5 transition-colors ${sellOrderType === 'market' ? 'border-[#f0b90b]/40 opacity-70' : 'border-[#363c45]'}`}>
                    <input
                      type="number"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={inputPrice}
                      readOnly
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Amount</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input type="number" className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]" placeholder="0.00" value={sellAmount} onChange={e => setSellAmount(e.target.value)} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">{selectedCoin.symbol}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => handleSellPercent(p)} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#f6465d] hover:text-[#f6465d] bg-[#2b3139] transition-colors">{p}%</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Total</label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={sellTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#f6465d] text-[10px] font-medium">Available: {coinAvail} {selectedCoin.symbol}</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : (
                  <button onClick={() => handlePlaceOrder('sell')} disabled={orderLoading || !inputPrice || !sellAmount} className="w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">
                    {orderLoading ? 'Placing…' : `Sell ${selectedCoin.symbol}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: MARKET LIST ── */}
        <div className={`order-3 lg:order-3 lg:col-span-3 bg-[#1e2329] rounded-sm flex flex-col overflow-hidden border border-[#2b3139] h-[400px] ${PANEL_H}`}>
          <div className="p-2.5 border-b border-[#2b3139]">
            <div className="relative">
              <IoSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#848e9c] text-xs" />
              <input type="text" placeholder="Search..." className="w-full bg-[#2b3139] border border-transparent focus:border-[#f0b90b] rounded py-1.5 pl-7 pr-3 text-xs text-white focus:outline-none transition-all" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center px-3 py-1.5 text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide border-b border-[#2b3139] shrink-0">
            <span className="flex-1">Pair</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-14 text-right">24h</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredCoins.map(coin => {
              const sym        = coin.symbol.toUpperCase();
              const isSelected = selectedCoin.symbol === sym;
              const positive   = (coin.price_change_percentage_24h ?? 0) >= 0;
 
              return (
                <div
                  key={coin.id}
                  onClick={() => handleCoinClick(coin)}
                  className={`flex items-center px-3 py-[5px] cursor-pointer border-b border-[#2b3139]/40 transition-colors ${isSelected ? 'bg-[#2b3139]' : 'hover:bg-[#2b3139]/50'}`}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <img src={coin.image} alt={sym} className="w-4 h-4 rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-[#eaecef] uppercase leading-tight">{sym}</div>
                      <div className="text-[9px] text-[#848e9c] leading-tight">{(coin.total_volume / 1e6).toFixed(1)}M vol</div>
                    </div>
                  </div>
                  <div className="w-20 text-right text-[11px] font-mono text-[#eaecef]">
                    ${coin.current_price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className={`w-14 text-right text-[10px] font-semibold ${positive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {positive ? '+' : ''}{coin.price_change_percentage_24h?.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trade;