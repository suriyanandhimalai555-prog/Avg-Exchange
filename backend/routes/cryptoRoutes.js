// backend/routes/cryptoRoutes.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Route to fetch Top 50 Cryptos in INR from CoinMarketCap
router.get('/listings', async (req, res) => {
  try {
    const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
      params: {
        start: 1,
        limit: 50,
        convert: 'INR'
      },
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API // Using provided key
      }
    });
    
    // Return the 'data' array from the CMC response
    res.json(response.data.data);
  } catch (error) {
    console.error("CMC API Error:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to fetch crypto listings" });
  }
});

module.exports = router;