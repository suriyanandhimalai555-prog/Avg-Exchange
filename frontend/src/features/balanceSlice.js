import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import API_URL from '../config/api';

export const fetchNavbarBalance = createAsyncThunk(
  'balance/fetchNavbar',
  async (_, { rejectWithValue }) => {
    try {
      const [balRes, mktRes] = await Promise.all([
        axios.get(`${API_URL}/api/user/balance`, { withCredentials: true }),
        axios.get(`${API_URL}/api/markets`, {
          params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
        }),
      ]);

      const balances = balRes.data ?? {};
      const markets  = mktRes.data ?? [];

      const priceMap = { USDT: 1 };
      for (const coin of markets) priceMap[coin.symbol.toUpperCase()] = coin.current_price ?? 0;

      let total = 0;
      for (const [currency, { available, locked }] of Object.entries(balances)) {
        total += (available + locked) * (priceMap[currency] ?? 0);
      }

      return total;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

const balanceSlice = createSlice({
  name: 'balance',
  initialState: {
    totalUSD: null,   // null = not loaded yet
    loading: false,
  },
  reducers: {
    clearBalance(state) {
      state.totalUSD = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNavbarBalance.pending,  (state) => { state.loading = true; })
      .addCase(fetchNavbarBalance.fulfilled, (state, action) => {
        state.loading  = false;
        state.totalUSD = action.payload;
      })
      .addCase(fetchNavbarBalance.rejected, (state) => { state.loading = false; });
  },
});

export const { clearBalance } = balanceSlice.actions;
export default balanceSlice.reducer;
