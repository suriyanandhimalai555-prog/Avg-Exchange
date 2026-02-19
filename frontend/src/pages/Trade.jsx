// frontend/src/pages/Trade.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import { IoSearch, IoRefreshOutline } from 'react-icons/io5';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import API_URL from '../config/api';
import TradingViewChart from '../components/TradingViewChart';

// --- CONFIG ---
// Fallback market data if CoinGecko API fails (Rate Limits or Offline)
const STATIC_COINS = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 65000, price_change_percentage_24h: 2.5, total_volume: 35000000000, image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3500, price_change_percentage_24h: 1.2, total_volume: 15000000000, image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'tether', symbol: 'usdt', name: 'Tether', current_price: 1.00, price_change_percentage_24h: 0.01, total_volume: 45000000000, image: 'https://assets.coingecko.com/coins/images/325/large/tether.png' },
  { id: 'binancecoin', symbol: 'bnb', name: 'BNB', current_price: 580, price_change_percentage_24h: -0.5, total_volume: 1200000000, image: 'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png' },
  { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 145, price_change_percentage_24h: 5.4, total_volume: 3200000000, image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'ripple', symbol: 'xrp', name: 'XRP', current_price: 0.60, price_change_percentage_24h: -1.2, total_volume: 1500000000, image: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
  { id: 'usd-coin', symbol: 'usdc', name: 'USDC', current_price: 1.00, price_change_percentage_24h: 0.0, total_volume: 5000000000, image: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png' },
  { id: 'cardano', symbol: 'ada', name: 'Cardano', current_price: 0.45, price_change_percentage_24h: 0.8, total_volume: 400000000, image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png' },
  { id: 'avalanche-2', symbol: 'avax', name: 'Avalanche', current_price: 35, price_change_percentage_24h: 3.1, total_volume: 500000000, image: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png' },
  { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', current_price: 0.15, price_change_percentage_24h: -2.1, total_volume: 1800000000, image: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png' },
  { id: 'polkadot', symbol: 'dot', name: 'Polkadot', current_price: 7.20, price_change_percentage_24h: 1.5, total_volume: 250000000, image: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png' },
  { id: 'chainlink', symbol: 'link', name: 'Chainlink', current_price: 18.50, price_change_percentage_24h: 4.2, total_volume: 600000000, image: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png' },
  { id: 'shiba-inu', symbol: 'shib', name: 'Shiba Inu', current_price: 0.000025, price_change_percentage_24h: -1.5, total_volume: 400000000, image: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png' },
  { id: 'matic-network', symbol: 'matic', name: 'Polygon', current_price: 0.70, price_change_percentage_24h: 2.2, total_volume: 300000000, image: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
  { id: 'litecoin', symbol: 'ltc', name: 'Litecoin', current_price: 85, price_change_percentage_24h: 0.5, total_volume: 450000000, image: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png' },
  { id: 'bitcoin-cash', symbol: 'bch', name: 'Bitcoin Cash', current_price: 450, price_change_percentage_24h: 1.1, total_volume: 300000000, image: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png' },
  { id: 'uniswap', symbol: 'uni', name: 'Uniswap', current_price: 10.50, price_change_percentage_24h: -0.8, total_volume: 150000000, image: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png' },
  { id: 'dai', symbol: 'dai', name: 'Dai', current_price: 1.00, price_change_percentage_24h: 0.05, total_volume: 120000000, image: 'https://assets.coingecko.com/coins/images/9956/large/4943.png' },
  { id: 'cosmos', symbol: 'atom', name: 'Cosmos', current_price: 8.50, price_change_percentage_24h: 2.7, total_volume: 200000000, image: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png' },
  { id: 'the-open-network', symbol: 'ton', name: 'Toncoin', current_price: 6.80, price_change_percentage_24h: 4.5, total_volume: 250000000, image: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png' }
];

// Known ERC-20 addresses on Ethereum mainnet.
const KNOWN_ERC20 = {
  ETH:   { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  WETH:  { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  BTC:   { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8  },
  WBTC:  { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8  },
  USDC:  { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6  },
  DAI:   { address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18 },
  LINK:  { address: '0x514910771af9ca656af840dff83e8264ecf986ca', decimals: 18 },
  UNI:   { address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', decimals: 18 },
  AAVE:  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', decimals: 18 },
  MKR:   { address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', decimals: 18 },
  MATIC: { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', decimals: 18 },
  POL:   { address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', decimals: 18 },
  LDO:   { address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32', decimals: 18 },
  CRV:   { address: '0xd533a949740bb3306d119cc777fa900ba034cd52', decimals: 18 },
  SHIB:  { address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', decimals: 18 },
  APE:   { address: '0x4d224452801aced8b2f0aebe155379bb5d594381', decimals: 18 },
  BNB:   { address: '0xb8c77482e45f1f44de1745f52c74426c631bdd52', decimals: 18 },
  GRT:   { address: '0xc944e90c64b2c07662a292be6244bdf05cda44a7', decimals: 18 },
  SNX:   { address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', decimals: 18 },
  // Native-chain coins with no ERC-20 on Ethereum mainnet
  SOL:   { address: null, decimals: 9  },
  XRP:   { address: null, decimals: 6  },
  DOGE:  { address: null, decimals: 8  },
  ADA:   { address: null, decimals: 6  },
  AVAX:  { address: null, decimals: 18 },
  DOT:   { address: null, decimals: 10 },
  TRX:   { address: null, decimals: 6  },
  LTC:   { address: null, decimals: 8  },
  BCH:   { address: null, decimals: 8  },
  XLM:   { address: null, decimals: 7  },
  ATOM:  { address: null, decimals: 6  },
  TON:   { address: null, decimals: 9  },
  SUI:   { address: null, decimals: 9  },
};

const USDT_TOKEN = {
  symbol: 'USDT',
  address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  decimals: 6,
};

const DEFAULT_TOKENS = [
  { symbol: 'ETH', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  USDT_TOKEN,
];

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

  const [tokenList,    setTokenList]    = useState(DEFAULT_TOKENS);
  const [selectedCoin, setSelectedCoin] = useState(DEFAULT_TOKENS[0]);
  const [marketList,   setMarketList]   = useState([]);
  const [search,       setSearch]       = useState('');
  const [bids,         setBids]         = useState([]);
  const [asks,         setAsks]         = useState([]);
  const [loadingBook,  setLoadingBook]  = useState(false);
  const [inputPrice,   setInputPrice]   = useState('');
  const [inputAmount,  setInputAmount]  = useState('');
  const [sellAmount,   setSellAmount]   = useState('');
  
  // Use a ref so fetchOrderBook can always access latest selectedCoin
  const selectedCoinRef = useRef(selectedCoin);
  useEffect(() => { selectedCoinRef.current = selectedCoin; }, [selectedCoin]);

  // FETCH TOKENS (1inch)
  useEffect(() => {
    axios.get(`${API_URL}/api/1inch/tokens`)
      .then(({ data }) => { if (Array.isArray(data)) setTokenList(data); })
      .catch(() => {});
  }, []);

  // FETCH MARKETS (CoinGecko with Smart Static Fallback)
  useEffect(() => {
    axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
    })
    .then(({ data }) => {
      console.log("✅ Live API Success! Loaded real data.");
      setMarketList(data);
    })
    .catch((error) => {
      console.warn("❌ Live API Failed! Status:", error.response?.status);
      console.warn("🔄 Smart Fallback: Checking if we already have data...");
      
      // The PERFECT FIX: If we already have live data (from the first React Strict Mode fetch), 
      // DON'T overwrite it. If we have nothing, load the STATIC_COINS.
      setMarketList(prevList => prevList.length > 0 ? prevList : STATIC_COINS);
    });
  }, []);

  // FETCH ORDER BOOK
  const fetchOrderBook = useCallback(async () => {
    const coin = selectedCoinRef.current;
    if (!coin.address || coin.symbol === 'USDT') {
      setAsks([]); setBids([]); return;
    }
    try {
      setLoadingBook(true);
      const [ar, br] = await Promise.all([
        axios.get(`${API_URL}/api/1inch/orderbook/1`, {
          params: { limit: 30, makerAsset: coin.address, takerAsset: USDT_TOKEN.address },
        }),
        axios.get(`${API_URL}/api/1inch/orderbook/1`, {
          params: { limit: 30, makerAsset: USDT_TOKEN.address, takerAsset: coin.address },
        }),
      ]);
      const fmt = (items, isAsk) =>
        (items || []).map((o) => {
          const ma = parseFloat(ethers.formatUnits(o.data.makingAmount, isAsk ? coin.decimals : USDT_TOKEN.decimals));
          const ta = parseFloat(ethers.formatUnits(o.data.takingAmount, isAsk ? USDT_TOKEN.decimals : coin.decimals));
          const price = isAsk ? ta / ma : ma / ta;
          return { price, amount: isAsk ? ma : ta };
        }).sort((a, b) => isAsk ? a.price - b.price : b.price - a.price);

      const rawAsks = fmt(ar.data.items, true);
      const rawBids = fmt(br.data.items, false);

      // Simple spread filter for clean display
      const refPrice = rawBids[0]?.price || rawAsks[0]?.price;
      if (refPrice) {
        const lo = refPrice * 0.5;
        const hi = refPrice * 2.0;
        setAsks(rawAsks.filter(o => o.price >= lo && o.price <= hi).slice(0, MAX_ROWS));
        setBids(rawBids.filter(o => o.price >= lo && o.price <= hi).slice(0, MAX_ROWS));
      } else {
        setAsks(rawAsks.slice(0, MAX_ROWS));
        setBids(rawBids.slice(0, MAX_ROWS));
      }
    } catch { 
      setAsks([]); setBids([]); 
    } finally { 
      setLoadingBook(false); 
    }
  }, []);

  useEffect(() => {
    setLoadingBook(true);
    fetchOrderBook();
    const i = setInterval(fetchOrderBook, 15000);
    return () => clearInterval(i);
  }, [selectedCoin, fetchOrderBook]);

  // HANDLERS
  const handleCoinClick = (coin) => {
    const symbol = coin.symbol.toUpperCase();
    
    // Priority: 1) 1inch tokenList  2) KNOWN_ERC20 map  3) null address (non-ERC20)
    const fromTokenList = tokenList.find(t => t.symbol.toUpperCase() === symbol);
    const fromKnown     = KNOWN_ERC20[symbol];
    const resolved = fromTokenList 
      ?? (fromKnown ? { symbol, ...fromKnown } : { symbol, address: null, decimals: 18 });
      
    setSelectedCoin(resolved);
    setInputPrice(''); setInputAmount(''); setSellAmount('');
    if (resolved.symbol === selectedCoinRef.current.symbol) {
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

  const askCount  = Math.min(asks.length, MAX_ROWS);
  const askSlots  = Array.from({ length: MAX_ROWS }, (_, i) => {
    const askIdx = i - (MAX_ROWS - askCount);
    return askIdx >= 0 ? asks[askIdx] : null;
  });
  const bidSlots = Array.from({ length: MAX_ROWS }, (_, i) => bids[i] ?? null);
  const noAddress  = !selectedCoin.address || selectedCoin.symbol === 'USDT';
  const isEmpty    = !loadingBook && !noAddress && asks.length === 0 && bids.length === 0;

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
          ) : noAddress ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-[#2b3139] flex items-center justify-center text-lg">🔗</div>
              <p className="text-[#eaecef] text-xs font-semibold">{selectedCoin.symbol} — no ERC-20</p>
              <p className="text-[#848e9c] text-[10px] leading-relaxed">
                This coin doesn't have an ERC-20 contract on Ethereum. Coins with a <span className="text-[#0ecb81] font-bold">●</span> support the orderbook.
              </p>
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
            <div className="flex flex-col lg:flex-row gap-4">
              {/* BUY SIDE */}
              <div className="flex-1 flex flex-col gap-2.5">
                <h3 className="text-[#0ecb81] font-bold text-sm">Buy {selectedCoin.symbol}</h3>
                <div className="relative">
                  <select className="w-full bg-[#2b3139] border border-[#363c45] text-[#eaecef] text-sm rounded px-3 py-2 appearance-none outline-none focus:border-[#f0b90b] cursor-pointer transition-colors">
                    <option value="limit">Limit Order</option>
                    <option value="market">Market Order</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] text-[10px]">▼</span>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Price</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input type="number" className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]" placeholder="0.00" value={inputPrice} onChange={e => setInputPrice(e.target.value)} />
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
                  {['25%', '50%', '75%', '100%'].map(p => (
                    <button key={p} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#0ecb81] hover:text-[#0ecb81] bg-[#2b3139] transition-colors">{p}</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Total</label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={buyTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#0ecb81] text-[10px] font-medium">Available: 0.00 USDT</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : (
                  <button onClick={() => alert('Complete KYC to trade.')} className="w-full py-2 bg-[#0ecb81] hover:bg-[#0bb874] text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">Buy {selectedCoin.symbol}</button>
                )}
              </div>

              <div className="hidden lg:block w-px bg-[#2b3139] self-stretch" />

              {/* SELL SIDE */}
              <div className="flex-1 flex flex-col gap-2.5">
                <h3 className="text-[#f6465d] font-bold text-sm">Sell {selectedCoin.symbol}</h3>
                <div className="relative">
                  <select className="w-full bg-[#2b3139] border border-[#363c45] text-[#eaecef] text-sm rounded px-3 py-2 appearance-none outline-none focus:border-[#f0b90b] cursor-pointer transition-colors">
                    <option value="limit">Limit Order</option>
                    <option value="market">Market Order</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] text-[10px]">▼</span>
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Price</label>
                  <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded flex items-center px-3 py-1.5 transition-colors">
                    <input type="number" className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono placeholder-[#848e9c]" placeholder="0.00" value={inputPrice} readOnly />
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
                  {['25%', '50%', '75%', '100%'].map(p => (
                    <button key={p} className="text-[10px] py-1 rounded border border-[#363c45] text-[#848e9c] hover:border-[#f6465d] hover:text-[#f6465d] bg-[#2b3139] transition-colors">{p}</button>
                  ))}
                </div>
                <div>
                  <label className="text-[#848e9c] text-[10px] mb-1 block">Total</label>
                  <div className="bg-[#2b3139] border border-[#363c45] rounded flex items-center px-3 py-1.5 opacity-60">
                    <input type="text" disabled className="bg-transparent text-[#eaecef] text-sm w-full outline-none font-mono cursor-not-allowed" value={sellTotal} />
                    <span className="text-[#848e9c] text-[10px] font-semibold pl-2 shrink-0">USDT</span>
                  </div>
                </div>
                <p className="text-[#f6465d] text-[10px] font-medium">Available: 0.00 {selectedCoin.symbol}</p>
                {!user ? (
                  <Link to="/login" className="block w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] text-white font-bold text-sm rounded text-center transition-colors">Login / Sign Up</Link>
                ) : (
                  <button onClick={() => alert('Complete KYC to trade.')} className="w-full py-2 bg-[#f6465d] hover:bg-[#e03d52] text-white font-bold text-sm rounded transition-colors active:scale-[0.98]">Sell {selectedCoin.symbol}</button>
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
              const hasOB      = sym !== 'USDT' && !!(KNOWN_ERC20[sym]?.address || tokenList.find(t => t.symbol.toUpperCase() === sym)?.address);
              
              return (
                <div
                  key={coin.id}
                  onClick={() => handleCoinClick(coin)}
                  className={`flex items-center px-3 py-[5px] cursor-pointer border-b border-[#2b3139]/40 transition-colors ${isSelected ? 'bg-[#2b3139]' : 'hover:bg-[#2b3139]/50'}`}
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <img src={coin.image} alt={sym} className="w-4 h-4 rounded-full" />
                      {hasOB && (
                        <span className="absolute -bottom-px -right-px w-1.5 h-1.5 rounded-full bg-[#0ecb81] ring-1 ring-[#1e2329]" title="Orderbook available" />
                      )}
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