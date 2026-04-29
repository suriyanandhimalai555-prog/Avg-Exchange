const express = require('express');
const axios = require('axios');
const router = express.Router();

const SUPPORTED_CHAIN_IDS = new Set([1, 56, 137, 42161, 10, 8453, 43114]);

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.ONE_INCH_API_KEY}`,
  'Content-Type': 'application/json',
});

const forwardRequest = async (res, method, url, config = {}) => {
  try {
    const response = await axios({ method, url, ...config });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(`1inch API Error [${url}]:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      message: '1inch API request failed',
      details: error.response?.data,
    });
  }
};

const parseChainId = (raw, fallback = 1) => {
  const id = parseInt(raw, 10);
  return SUPPORTED_CHAIN_IDS.has(id) ? id : fallback;
};

// GET /api/1inch/tokens?chainId=1
router.get('/tokens', async (req, res) => {
  const chainId = parseChainId(req.query.chainId);
  const url = `https://api.1inch.dev/token/v1.2/${chainId}`;

  try {
    const response = await axios.get(url, { headers: getHeaders() });
    const tokenList = Object.values(response.data).map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      logoURI: t.logoURI,
    }));
    res.status(200).json(tokenList);
  } catch (error) {
    console.error('1inch Token Fetch Error:', error.message);
    res.status(500).json({ message: 'Failed to fetch tokens' });
  }
});

// GET /api/1inch/swap/quote?chainId=1&src=&dst=&amount=
router.get('/swap/quote', (req, res) => {
  const { src, dst, amount } = req.query;
  if (!src || !dst || !amount) {
    return res.status(400).json({ message: 'src, dst, and amount are required' });
  }
  const chainId = parseChainId(req.query.chainId);
  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote`;
  forwardRequest(res, 'get', url, { headers: getHeaders(), params: { src, dst, amount } });
});

// GET /api/1inch/swap/build?chainId=1&src=&dst=&amount=&from=&slippage=
router.get('/swap/build', (req, res) => {
  const { src, dst, amount, from, slippage } = req.query;
  if (!src || !dst || !amount || !from) {
    return res.status(400).json({ message: 'src, dst, amount, and from are required' });
  }
  const chainId = parseChainId(req.query.chainId);
  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap`;
  forwardRequest(res, 'get', url, {
    headers: getHeaders(),
    params: { src, dst, amount, from, slippage: slippage || 1 },
  });
});

// GET /api/1inch/orderbook/:chainId
router.get('/orderbook/:chainId', (req, res) => {
  const chainId = parseChainId(req.params.chainId);
  const url = `https://api.1inch.dev/orderbook/v4.1/${chainId}/all`;
  forwardRequest(res, 'get', url, { headers: getHeaders(), params: req.query });
});

module.exports = router;
