import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { userApi, marketApi } from '../api';

export const fetchNavbarBalance = createAsyncThunk(
  'balance/fetchNavbar',
  async (_, { rejectWithValue }) => {
    try {
      const [balRes, mktRes] = await Promise.all([
        userApi.getBalance(),
        marketApi.getMarkets({ vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 }),
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
    totalUSD: null,
    loading: false,
  },
  reducers: {
    clearBalance(state) { state.totalUSD = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNavbarBalance.pending,   (s) => { s.loading = true; })
      .addCase(fetchNavbarBalance.fulfilled, (s, a) => { s.loading = false; s.totalUSD = a.payload; })
      .addCase(fetchNavbarBalance.rejected,  (s) => { s.loading = false; });
  },
});

export const { clearBalance } = balanceSlice.actions;
export default balanceSlice.reducer;
