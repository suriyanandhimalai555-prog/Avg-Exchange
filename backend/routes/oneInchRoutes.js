// backend/routes/oneInchRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const API_KEY = process.env.ONE_INCH_API_KEY;

const getHeaders = () => ({
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
});

const forwardRequest = async (res, method, url, config = {}) => {
  try {
    const response = await axios({ method, url, ...config });
    res.status(200).json(response.data);
  } catch (error) {
    console.error(`1inch API Error [${url}]:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      message: "1inch API Request Failed",
      details: error.response?.data
    });
  }
};

// 1. TOKENS (Fixed: Defaults chainId to 1)
router.get('/tokens', async (req, res) => {
  const { chainId = 1 } = req.query; 
  const url = `https://api.1inch.dev/token/v1.2/${chainId}`;
  
  try {
    const response = await axios.get(url, { headers: getHeaders() });
    const tokenList = Object.values(response.data).map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
      logoURI: t.logoURI
    }));
    res.status(200).json(tokenList);
  } catch (error) {
    console.error("Token Fetch Error:", error.message);
    res.status(500).json({ message: "Failed to fetch tokens" });
  }
});

// 2. SWAP
router.get('/swap/quote', async (req, res) => {
  const { chainId = 1, src, dst, amount } = req.query;
  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote`;
  await forwardRequest(res, 'get', url, { headers: getHeaders(), params: { src, dst, amount } });
});

router.get('/swap/build', async (req, res) => {
  const { chainId = 1, src, dst, amount, from, slippage } = req.query;
  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap`;
  await forwardRequest(res, 'get', url, { headers: getHeaders(), params: { src, dst, amount, from, slippage } });
});

// 3. ORDERBOOK (Fixed: Defaults chainId to 1)
router.get('/orderbook/:chainId', async (req, res) => {
  let { chainId } = req.params;
  // If chainId is missing or string 'undefined', force it to 1
  if (!chainId || chainId === 'undefined') chainId = 1;

  const url = `https://api.1inch.dev/orderbook/v4.1/${chainId}/all`;
  await forwardRequest(res, 'get', url, { headers: getHeaders(), params: req.query });
});

module.exports = router;