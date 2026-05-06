// frontend/src/pages/Trade.jsx
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { IoSearch, IoRefreshOutline } from 'react-icons/io5';
import { useSelector, useDispatch } from 'react-redux';
import { fetchNavbarBalance } from '../features/balanceSlice';
import { Link, useSearchParams } from 'react-router-dom';
import API_URL from '../config/api';
import TradingViewChart from '../components/TradingViewChart';
import useTradeSocket from '../hooks/useTradeSocket';

const MAX_ROWS = 12; // rows per side in order book
const ROW_H    = 22; // px — fixed row height

// --- ORDER BOOK ROW ---
const ObRow = ({ o, side, maxAmount }) => {
  const isAsk = side === 'ask';
  if (!o) return <div style={{ height: ROW_H }} />;
  // Bar width relative to the largest amount in this side of the book
  const w = maxAmount > 0 ? Math.min((o.amount / maxAmount) * 100, 100) : 0;
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
        {Number(o.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </span>
      <span className="flex-1 text-right z-10 font-mono text-[#eaecef] flex items-center justify-end">
        {Number(o.amount).toFixed(4)}
      </span>
      <span className="flex-1 text-right z-10 font-mono text-[#eaecef] opacity-50 group-hover:opacity-100 flex items-center justify-end">
        {(o.price * o.amount).toFixed(2)}
      </span>
    </div>
  );
};

// Max recent trades to keep in memory
const MAX_TRADES = 30;

// Module-level counter — gives every incoming trade a unique, stable id
let _tradeSeq = 0;

// Format a trade timestamp as HH:MM:SS
const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// Sanitize numeric input: allow only digits, one dot, and strip leading zeros
const sanitizeNumeric = (val) => {
  let s = val.replace(/[^0-9.]/g, '');
  // Only allow one decimal point
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  return s;
};

const buildStaticEntry = (staticCoin) => {
  const current  = parseFloat(staticCoin.current_price);
  const ago      = parseFloat(staticCoin.price_24h_ago) || current;
  const change24h = ago > 0 ? ((current - ago) / ago) * 100 : 0;
  return {
    id:                          staticCoin.symbol.toLowerCase(),
    symbol:                      staticCoin.symbol.toLowerCase(),
    name:                        staticCoin.symbol,
    image:                       '/avg-coin.svg',
    current_price:               current,
    price_change_percentage_24h: change24h,
    high_24h:                    parseFloat(staticCoin.max_price),
    low_24h:                     parseFloat(staticCoin.min_price),
    total_volume:                0,
    _isStatic:                   true,
  };
};

// --- MAIN COMPONENT ---
const Trade = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();

  // Read pair from URL query (?pair=ETH/USDT → 'ETH'), default to BTC
  const initialSymbol = (() => {
    const p = searchParams.get('pair');
    if (p && p.includes('/')) return p.split('/')[0].toUpperCase();
    return 'BTC';
  })();

  const [selectedCoin, setSelectedCoin] = useState({ symbol: initialSymbol });
  const [marketList,   setMarketList]   = useState([]);
  const [search,       setSearch]       = useState('');
  const [bids,         setBids]         = useState([]);
  const [asks,         setAsks]         = useState([]);
  const [loadingBook,  setLoadingBook]  = useState(false);

  // Separate price and amount state for buy and sell sides
  const [buyPrice,     setBuyPrice]     = useState('');
  const [buyAmount,    setBuyAmount]    = useState('');
  const [sellPrice,    setSellPrice]    = useState('');
  const [sellAmount,   setSellAmount]   = useState('');

  const [balances,     setBalances]     = useState({});
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState(null);
  const [buyOrderType,  setBuyOrderType]  = useState('limit');
  const [sellOrderType, setSellOrderType] = useState('limit');
  const [kycStatus, setKycStatus] = useState(null);

  // Binance live market data
  const [livePrices,   setLivePrices]   = useState({});
  const [recentTrades, setRecentTrades] = useState([]);
  const [leftTab, setLeftTab] = useState('book');

  // Refs that buffer incoming Binance data between render cycles.
  const pendingTickersRef = useRef({});
  const pendingTradesRef  = useRef([]);

  // Flush ticker buffer once per second.
  useEffect(() => {
    const id = setInterval(() => {
      const snapshot = pendingTickersRef.current;
      if (Object.keys(snapshot).length === 0) return;
      pendingTickersRef.current = {};
      setLivePrices(prev => ({ ...prev, ...snapshot }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Flush trade buffer every 300 ms.
  useEffect(() => {
    const id = setInterval(() => {
      const snapshot = pendingTradesRef.current;
      if (snapshot.length === 0) return;
      pendingTradesRef.current = [];
      setRecentTrades(prev => [...snapshot, ...prev].slice(0, MAX_TRADES));
    }, 300);
    return () => clearInterval(id);
  }, []);

  const selectedCoinRef = useRef(selectedCoin);
  useEffect(() => { selectedCoinRef.current = selectedCoin; }, [selectedCoin]);

  // Clear recent trades when the pair changes
  useEffect(() => { setRecentTrades([]); }, [selectedCoin.symbol]);

  // Auto-fill market order price from live feed (continuously updated)
  useEffect(() => {
    const livePrice = livePrices[selectedCoin.symbol]?.price;
    const mktObj    = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol) || {};
    const price     = livePrice ?? mktObj.current_price;
    if (!price) return;
    if (buyOrderType  === 'market') setBuyPrice(String(price));
    if (sellOrderType === 'market') setSellPrice(String(price));
  }, [buyOrderType, sellOrderType, selectedCoin, marketList, livePrices]);

  // FETCH MARKETS — base list loaded once; static coin price polled every 15s
  const baseListRef = useRef(null);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/api/markets`, {
        params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
      }).catch(() => ({ data: null })),
      axios.get(`${API_URL}/api/markets/static-coin`).catch(() => ({ data: null })),
    ]).then(([marketsRes, staticRes]) => {
      const base = marketsRes.data || [];
      baseListRef.current = base;
      const staticCoin = staticRes.data;
      if (staticCoin) {
        setMarketList([...base, buildStaticEntry(staticCoin)]);
      } else {
        setMarketList(base);
      }
    });
  }, []);

  // Poll static coin price every 15s so admin price changes reflect immediately
  useEffect(() => {
    const refresh = () =>
      axios.get(`${API_URL}/api/markets/static-coin`).then(({ data }) => {
        if (!data || !baseListRef.current) return;
        setMarketList(prev => {
          const without = prev.filter(c => !c._isStatic);
          return [...without, buildStaticEntry(data)];
        });
      }).catch(() => {});

    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, []);

  // FETCH ORDER BOOK
  const fetchOrderBook = useCallback(async () => {
    const coin = selectedCoinRef.current;
    const pair = `${coin.symbol}/USDT`;
    try {
      setLoadingBook(true);
      const { data } = await axios.get(`${API_URL}/api/trade/orderbook`, { params: { pair } });
      setAsks((data.asks || []).slice(0, MAX_ROWS));
      setBids((data.bids || []).slice(0, MAX_ROWS));
    } catch {
      setAsks([]); setBids([]);
    } finally {
      setLoadingBook(false);
    }
  }, []);

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

  useEffect(() => {
    if (!user) { setKycStatus('none'); return; }
    axios.get(`${API_URL}/api/kyc/status`, { withCredentials: true })
      .then(({ data }) => setKycStatus(data.status ?? 'none'))
      .catch(() => setKycStatus('none'));
  }, [user]);

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
    onBinanceTicker: (data) => {
      pendingTickersRef.current[data.symbol] = data;
    },
    onBinanceTrade: (data) => {
      pendingTradesRef.current.unshift({ ...data, _id: _tradeSeq++ });
    },
  });

  // PLACE ORDER — uses the correct price/amount for each side
  const handlePlaceOrder = async (side) => {
    const price = side === 'buy' ? buyPrice : sellPrice;
    const qty   = side === 'buy' ? buyAmount : sellAmount;

    const numPrice = parseFloat(price);
    const numQty   = parseFloat(qty);

    // Client-side guard: prevent zero, negative, NaN
    if (!numPrice || numPrice <= 0 || !numQty || numQty <= 0) {
      setOrderFeedback({ type: 'error', message: 'Price and amount must be positive numbers' });
      setTimeout(() => setOrderFeedback(null), 4000);
      return;
    }

    setOrderLoading(true);
    setOrderFeedback(null);
    try {
      const orderType = side === 'buy' ? buyOrderType : sellOrderType;
      const { data } = await axios.post(
        `${API_URL}/api/trade/order`,
        { pair: `${selectedCoin.symbol}/USDT`, side, type: orderType, price: numPrice, quantity: numQty },
        { withCredentials: true }
      );
      const filled = data.executedTrades?.length ?? 0;
      const actualUSDT = (data.executedTrades ?? []).reduce(
        (sum, t) => sum + parseFloat(t.price) * parseFloat(t.quantity), 0
      );
      const filledQty   = numQty - (data.quantityLeft ?? 0);
      const isPartial   = orderType === 'market' && (data.quantityLeft ?? 0) > 0;
      setOrderFeedback({
        type: 'success',
        message: filled > 0
          ? orderType === 'market' && actualUSDT > 0
            ? isPartial
              ? `Partially filled — ${filledQty.toFixed(4)} ${selectedCoin.symbol} for ${actualUSDT.toFixed(2)} USDT (rest refunded)`
              : `Order filled — ${side === 'buy' ? 'spent' : 'received'} ${actualUSDT.toFixed(2)} USDT`
            : `Order filled — ${filled} trade${filled > 1 ? 's' : ''} executed`
          : 'Order placed — waiting for a match',
      });
      // Only clear the side that was submitted
      if (side === 'buy') {
        setBuyAmount('');
        if (buyOrderType === 'limit') setBuyPrice('');
      } else {
        setSellAmount('');
        if (sellOrderType === 'limit') setSellPrice('');
      }
      fetchBalances();
      dispatch(fetchNavbarBalance());
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
    const price = parseFloat(buyPrice);
    if (!price || price <= 0 || !available) return;
    setBuyAmount(((available * pct / 100) / price).toFixed(6));
  };
  const handleSellPercent = (pct) => {
    const available = balances[selectedCoin.symbol]?.available ?? 0;
    if (!available) return;
    setSellAmount(((available * pct) / 100).toFixed(6));
  };

  // Click an orderbook row to populate price
  const handleBookRowClick = (price) => {
    if (!price) return;
    const priceStr = String(price);
    if (buyOrderType  === 'limit') setBuyPrice(priceStr);
    if (sellOrderType === 'limit') setSellPrice(priceStr);
  };

  // HANDLERS
  const handleCoinClick = (coin) => {
    const symbol = coin.symbol.toUpperCase();
    setSelectedCoin({ symbol });
    setBuyOrderType('limit'); setSellOrderType('limit');
    setBuyPrice(''); setBuyAmount('');
    setSellPrice(''); setSellAmount('');
  };

  // DERIVED STATE
  const filteredCoins = marketList.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );
  const mkt      = marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol) || {};
  const liveMkt  = livePrices[selectedCoin.symbol];
  const dispPrice    = liveMkt?.price              ?? mkt.current_price;
  const dispChange   = liveMkt?.change24h          ?? mkt.price_change_percentage_24h;
  const dispHigh     = liveMkt?.high24h            ?? mkt.high_24h;
  const dispLow      = liveMkt?.low24h             ?? mkt.low_24h;
  const dispVolume   = liveMkt?.volume24h          ?? mkt.total_volume;
  const up           = (dispChange ?? 0) >= 0;

  const buyTotal  = buyPrice && buyAmount ? (parseFloat(buyPrice) * parseFloat(buyAmount)).toFixed(2) : '0';
  const sellTotal = sellPrice && sellAmount ? (parseFloat(sellPrice) * parseFloat(sellAmount)).toFixed(2) : '0';
  const usdtAvail = (balances.USDT?.available ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const coinAvail = (balances[selectedCoin.symbol]?.available ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

  // Compute max amount per side for depth bar scaling
  const maxAskAmount = useMemo(() => asks.reduce((m, o) => Math.max(m, o?.amount ?? 0), 0), [asks]);
  const maxBidAmount = useMemo(() => bids.reduce((m, o) => Math.max(m, o?.amount ?? 0), 0), [bids]);

  const askCount = Math.min(asks.length, MAX_ROWS);
  const askSlots = Array.from({ length: MAX_ROWS }, (_, i) => {
    const emptyCount = MAX_ROWS - askCount;
    if (i < emptyCount) return null;
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
          {dispChange?.toFixed(2) ?? '—'}%
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
          ${dispPrice?.toLocaleString() ?? '—'}
        </span>
        {[
          ['24h Change', `${up ? '+' : ''}${dispChange?.toFixed(2) ?? '—'}%`, up],
          ['24h High',   `$${dispHigh?.toLocaleString() ?? '—'}`,  null],
          ['24h Low',    `$${dispLow?.toLocaleString() ?? '—'}`,   null],
          ['Volume',     dispVolume ? `$${(dispVolume / 1e9).toFixed(2)}B` : '—', null],
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

        {/* LEFT: ORDER BOOK / LIVE TRADES */}
        <div className={`order-4 lg:order-1 lg:col-span-3 bg-[#1e2329] rounded-sm flex flex-col overflow-hidden border border-[#2b3139] h-[620px] ${PANEL_H}`}>

          {/* Tab switcher */}
          <div className="flex items-center border-b border-[#2b3139] shrink-0">
            <button
              onClick={() => setLeftTab('book')}
              className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${leftTab === 'book' ? 'text-[#eaecef] border-b-2 border-[#f0b90b]' : 'text-[#848e9c] hover:text-[#eaecef]'}`}
            >
              Order Book
            </button>
            <button
              onClick={() => setLeftTab('trades')}
              className={`flex-1 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${leftTab === 'trades' ? 'text-[#eaecef] border-b-2 border-[#f0b90b]' : 'text-[#848e9c] hover:text-[#eaecef]'}`}
            >
              Live Trades
            </button>
          </div>

          {/* ORDER BOOK tab */}
          {leftTab === 'book' && (
            <>
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
                  <div className="shrink-0">
                    {askSlots.map((o, i) => (
                      <div key={i} onClick={() => o && handleBookRowClick(o.price)}>
                        <ObRow o={o} side="ask" maxAmount={maxAskAmount} />
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-y border-[#2b3139] flex items-center justify-between bg-[#0b0e11] shrink-0">
                    <span className={`text-sm font-bold ${up ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      ${dispPrice?.toLocaleString() ?? '---'}
                    </span>
                    <span className="text-[10px] text-[#848e9c]">≈ ${dispPrice?.toLocaleString() ?? '---'}</span>
                  </div>
                  <div className="shrink-0">
                    {bidSlots.map((o, i) => (
                      <div key={i} onClick={() => o && handleBookRowClick(o.price)}>
                        <ObRow o={o} side="bid" maxAmount={maxBidAmount} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* LIVE TRADES tab */}
          {leftTab === 'trades' && (
            <>
              <div className="flex items-center px-3 py-1.5 border-b border-[#2b3139] shrink-0">
                <span className="flex-1 text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Price (USDT)</span>
                <span className="flex-1 text-right text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Qty</span>
                <span className="w-16 text-right text-[10px] font-semibold text-[#848e9c] uppercase tracking-wide">Time</span>
              </div>

              {recentTrades.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-[#2b3139] border-t-[#848e9c] rounded-full animate-spin" />
                  <span className="text-[#848e9c] text-xs">Connecting…</span>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {recentTrades.map((t) => (
                    <div key={t._id} className="flex items-center px-3 hover:bg-[#2b3139]" style={{ height: ROW_H }}>
                      <span className={`flex-1 font-mono text-xs ${t.isBuyerMaker ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>
                        {t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="flex-1 text-right font-mono text-xs text-[#eaecef]">
                        {t.qty.toFixed(4)}
                      </span>
                      <span className="w-16 text-right text-[10px] text-[#848e9c]">
                        {fmtTime(t.time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* CENTER: CHART + FORM */}
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
                        const price = livePrices[selectedCoin.symbol]?.price
                          ?? marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol)?.current_price;
                        if (price) setBuyPrice(String(price));
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
                      type="text"
                      inputMode="decimal"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={buyPrice}
                      readOnly={buyOrderType === 'market'}
                      onChange={e => buyOrderType === 'limit' && setBuyPrice(sanitizeNumeric(e.target.value))}
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Amount</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={buyAmount}
                      onChange={e => setBuyAmount(sanitizeNumeric(e.target.value))}
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">{selectedCoin.symbol}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => handleBuyPercent(p)} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#0ecb81] hover:text-[#0ecb81] bg-[#2b3139] transition-colors">{p}%</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">
                    {buyOrderType === 'market' ? 'Est. Total' : 'Total'}
                    {buyOrderType === 'market' && <span className="ml-1 text-[#848e9c] font-normal"></span>}
                  </label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={buyTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#0ecb81] text-[10px] font-medium">Available: {usdtAvail} USDT</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : kycStatus !== 'approved' ? (
                  <Link to="/account" className="block w-full py-2 bg-[#2b3139] border border-[#363c45] text-[#f0b90b] font-bold text-xs rounded text-center transition-colors hover:border-[#f0b90b]">
                    {kycStatus === null ? 'Checking KYC…' : 'Complete KYC to Trade →'}
                  </Link>
                ) : (
                  <button onClick={() => handlePlaceOrder('buy')} disabled={orderLoading || !buyPrice || !buyAmount} className="w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">
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
                        const price = livePrices[selectedCoin.symbol]?.price
                          ?? marketList.find(m => m.symbol.toUpperCase() === selectedCoin.symbol)?.current_price;
                        if (price) setSellPrice(String(price));
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
                  <div className={`bg-[#2b3139] border rounded flex items-center px-3 py-1.5 transition-colors ${sellOrderType === 'market' ? 'border-[#f0b90b]/40 opacity-70' : 'border-[#363c45] focus-within:border-[#f0b90b]'}`}>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={sellPrice}
                      readOnly={sellOrderType === 'market'}
                      onChange={e => sellOrderType === 'limit' && setSellPrice(sanitizeNumeric(e.target.value))}
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Amount</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]"
                      placeholder="0.00"
                      value={sellAmount}
                      onChange={e => setSellAmount(sanitizeNumeric(e.target.value))}
                    />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">{selectedCoin.symbol}</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[25, 50, 75, 100].map(p => (
                    <button key={p} onClick={() => handleSellPercent(p)} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#f6465d] hover:text-[#f6465d] bg-[#2b3139] transition-colors">{p}%</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">
                    {sellOrderType === 'market' ? 'Est. Total' : 'Total'}
                    {sellOrderType === 'market' && <span className="ml-1 text-[#848e9c] font-normal">(actual may differ)</span>}
                  </label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={sellTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#f6465d] text-[10px] font-medium">Available: {coinAvail} {selectedCoin.symbol}</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : kycStatus !== 'approved' ? (
                  <Link to="/account" className="block w-full py-2 bg-[#2b3139] border border-[#363c45] text-[#f0b90b] font-bold text-xs rounded text-center transition-colors hover:border-[#f0b90b]">
                    {kycStatus === null ? 'Checking KYC…' : 'Complete KYC to Trade →'}
                  </Link>
                ) : (
                  <button onClick={() => handlePlaceOrder('sell')} disabled={orderLoading || !sellPrice || !sellAmount} className="w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">
                    {orderLoading ? 'Placing…' : `Sell ${selectedCoin.symbol}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: MARKET LIST */}
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

              const live        = livePrices[sym];
              const displayPrice  = live?.price    ?? coin.current_price;
              const displayChange = live?.change24h ?? coin.price_change_percentage_24h;
              const livePositive  = (displayChange ?? 0) >= 0;

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
                    ${displayPrice?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className={`w-14 text-right text-[10px] font-semibold ${livePositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {livePositive ? '+' : ''}{displayChange?.toFixed(2)}%
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
