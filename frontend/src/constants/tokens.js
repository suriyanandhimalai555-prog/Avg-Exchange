// Fallback market data used when the CoinGecko API is unavailable (rate limit / offline).
// Prices here are approximations — they will be stale. Update periodically if needed.
export const STATIC_COINS = [
  { id: 'bitcoin',        symbol: 'btc',   name: 'Bitcoin',      current_price: 65000,      price_change_percentage_24h:  2.5,  total_volume: 35000000000, image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ethereum',       symbol: 'eth',   name: 'Ethereum',     current_price: 3500,       price_change_percentage_24h:  1.2,  total_volume: 15000000000, image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'tether',         symbol: 'usdt',  name: 'Tether',       current_price: 1.00,       price_change_percentage_24h:  0.01, total_volume: 45000000000, image: 'https://assets.coingecko.com/coins/images/325/large/tether.png' },
  { id: 'binancecoin',    symbol: 'bnb',   name: 'BNB',          current_price: 580,        price_change_percentage_24h: -0.5,  total_volume: 1200000000,  image: 'https://assets.coingecko.com/coins/images/825/large/binance-coin-logo.png' },
  { id: 'solana',         symbol: 'sol',   name: 'Solana',       current_price: 145,        price_change_percentage_24h:  5.4,  total_volume: 3200000000,  image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'ripple',         symbol: 'xrp',   name: 'XRP',          current_price: 0.60,       price_change_percentage_24h: -1.2,  total_volume: 1500000000,  image: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
  { id: 'usd-coin',       symbol: 'usdc',  name: 'USDC',         current_price: 1.00,       price_change_percentage_24h:  0.0,  total_volume: 5000000000,  image: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png' },
  { id: 'cardano',        symbol: 'ada',   name: 'Cardano',      current_price: 0.45,       price_change_percentage_24h:  0.8,  total_volume: 400000000,   image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png' },
  { id: 'avalanche-2',    symbol: 'avax',  name: 'Avalanche',    current_price: 35,         price_change_percentage_24h:  3.1,  total_volume: 500000000,   image: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png' },
  { id: 'dogecoin',       symbol: 'doge',  name: 'Dogecoin',     current_price: 0.15,       price_change_percentage_24h: -2.1,  total_volume: 1800000000,  image: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png' },
  { id: 'polkadot',       symbol: 'dot',   name: 'Polkadot',     current_price: 7.20,       price_change_percentage_24h:  1.5,  total_volume: 250000000,   image: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png' },
  { id: 'chainlink',      symbol: 'link',  name: 'Chainlink',    current_price: 18.50,      price_change_percentage_24h:  4.2,  total_volume: 600000000,   image: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png' },
  { id: 'shiba-inu',      symbol: 'shib',  name: 'Shiba Inu',    current_price: 0.000025,   price_change_percentage_24h: -1.5,  total_volume: 400000000,   image: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png' },
  { id: 'matic-network',  symbol: 'matic', name: 'Polygon',      current_price: 0.70,       price_change_percentage_24h:  2.2,  total_volume: 300000000,   image: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
  { id: 'litecoin',       symbol: 'ltc',   name: 'Litecoin',     current_price: 85,         price_change_percentage_24h:  0.5,  total_volume: 450000000,   image: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png' },
  { id: 'bitcoin-cash',   symbol: 'bch',   name: 'Bitcoin Cash', current_price: 450,        price_change_percentage_24h:  1.1,  total_volume: 300000000,   image: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png' },
  { id: 'uniswap',        symbol: 'uni',   name: 'Uniswap',      current_price: 10.50,      price_change_percentage_24h: -0.8,  total_volume: 150000000,   image: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png' },
  { id: 'dai',            symbol: 'dai',   name: 'Dai',          current_price: 1.00,       price_change_percentage_24h:  0.05, total_volume: 120000000,   image: 'https://assets.coingecko.com/coins/images/9956/large/4943.png' },
  { id: 'cosmos',         symbol: 'atom',  name: 'Cosmos',       current_price: 8.50,       price_change_percentage_24h:  2.7,  total_volume: 200000000,   image: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png' },
  { id: 'the-open-network', symbol: 'ton', name: 'Toncoin',      current_price: 6.80,       price_change_percentage_24h:  4.5,  total_volume: 250000000,   image: 'https://assets.coingecko.com/coins/images/17980/large/ton_symbol.png' },
];

// ERC-20 token addresses on Ethereum mainnet (chainId 1).
// Tokens with address: null have no ERC-20 on mainnet and don't support the on-chain orderbook.
export const KNOWN_ERC20 = {
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
  // Native-chain coins — no ERC-20 on Ethereum mainnet
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

export const USDT_TOKEN = {
  symbol: 'USDT',
  address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  decimals: 6,
};

export const DEFAULT_TOKENS = [
  { symbol: 'ETH', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  USDT_TOKEN,
];
