// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const { errorHandler } = require('./middleware/errorMiddleware');
const userRoutes = require('./routes/user');
const cryptoRoutes = require('./routes/cryptoRoutes'); // <--- Import
const oneInchRoutes = require('./routes/oneInchRoutes');

const app = express();

app.use(cors({
  origin: 'http://localhost:5173', 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

// Existing Proxy Route (Keep this for the Home page Trending section)
app.get('/api/trending', async (req, res) => {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 15,
        page: 1,
      },
      headers: {
        'x-cg-demo-api-key': process.env.COINGECKO_API_KEY 
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("CoinGecko Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ message: "API Data Unreachable" });
  }
});

// Mount Routes
app.use('/api/user', userRoutes);
app.use('/api/crypto', cryptoRoutes); // <--- Mount New Route
app.use('/api/1inch', oneInchRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));