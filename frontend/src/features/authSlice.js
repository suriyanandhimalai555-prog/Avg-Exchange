import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import API_URL from '../config/api.js'

const savedUser = (() => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

// Silently re-fetches the user profile from the server using the existing cookie.
// Fixes stale localStorage (e.g. missing `id` from old sessions).
export const refreshUser = createAsyncThunk(
  'auth/refreshUser',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_URL}/api/user/me`, { credentials: 'include' });
      if (!res.ok) return rejectWithValue(null); // not logged in — ignore silently
      const data = await res.json();
      const user = {
        id:           data.id,
        email:        data.email,
        name:         data.name,
        referralCode: data.referral_code,
        isAdmin:      data.is_admin,
        kycStatus:    data.kyc_status,
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch {
      return rejectWithValue(null);
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  // Accept rememberMe
  async ({ email, password, rememberMe }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass rememberMe to backend
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: 'include' 
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      
      localStorage.setItem('user', JSON.stringify(data));
      return data; 
    } catch (err) {
      return rejectWithValue('Network error');
    }
  }
);

export const signupUser = createAsyncThunk(
  'auth/signupUser',
  // Accept name
  async ({ name, email, password, referralCode }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass name to backend
        body: JSON.stringify({ name, email, password, referralCode }),
        credentials: 'include'
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      
      localStorage.setItem('user', JSON.stringify(data));
      return data; 
    } catch (err) {
      return rejectWithValue('Network error');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      await fetch(`${API_URL}/api/user/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (_) {
      // Ignore network errors — still clear local state
    }
    localStorage.removeItem('user');
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: savedUser,
    loading: false,
    error: null
  },
  reducers: {
    logout(state) {
      state.user = null;
      state.error = null;
      localStorage.removeItem('user');
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(signupUser.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(signupUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(signupUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.error = null;
      })
      .addCase(refreshUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(refreshUser.rejected, (state) => {
        // Cookie invalid/expired — clear stale local user
        state.user = null;
        localStorage.removeItem('user');
      });
  }
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer