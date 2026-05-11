import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import API_URL from '../config/api.js'

const savedUser = (() => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

const getStoredToken = () => {
  try { return JSON.parse(localStorage.getItem('user') || '{}')?.token || null; }
  catch { return null; }
};

// Silently re-fetches the user profile using the existing cookie.
export const refreshUser = createAsyncThunk(
  'auth/refreshUser',
  async (_, { rejectWithValue }) => {
    try {
      const token = getStoredToken();
      const res = await fetch(`${API_URL}/api/user/me`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return rejectWithValue(null);
      const data = await res.json();
      // Preserve the original tokenExpiresAt set at login — never reset it on refresh.
      const stored = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
      const user = {
        id:             data.id,
        email:          data.email,
        name:           data.name,
        referralCode:   data.referral_code,
        isAdmin:        data.is_admin,
        kycStatus:      data.kyc_status,
        tokenExpiresAt: stored.tokenExpiresAt ?? (Date.now() + 3 * 60 * 60 * 1000),
        token:          stored.token ?? null,  // preserve JWT for Bearer auth on mobile (cookies may be blocked)
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch {
      return rejectWithValue(null);
    }
  }
);

// ── Login — Step 1: validate credentials, send OTP to email ─────
export const sendLoginOtp = createAsyncThunk(
  'auth/sendLoginOtp',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      return data; // { otpSent: true, email }
    } catch {
      return rejectWithValue('Network error');
    }
  }
);

// ── Login — Step 2: verify OTP, receive session token ───────────
export const verifyLoginOtp = createAsyncThunk(
  'auth/verifyLoginOtp',
  async ({ email, code }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/verify-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      const user = { ...data, tokenExpiresAt: Date.now() + 3 * 60 * 60 * 1000 };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch {
      return rejectWithValue('Network error');
    }
  }
);

// ── Signup — Step 1: validate, send OTP to email ────────────────
export const sendSignupOtp = createAsyncThunk(
  'auth/sendSignupOtp',
  async ({ name, email, password, referralCode }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, referralCode }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      return data; // { otpSent: true, email }
    } catch {
      return rejectWithValue('Network error');
    }
  }
);

// ── Signup — Step 2: verify OTP, create account, receive token ──
export const verifySignupOtp = createAsyncThunk(
  'auth/verifySignupOtp',
  async ({ email, code }, { rejectWithValue }) => {
    try {
      const response = await fetch(`${API_URL}/api/user/verify-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) return rejectWithValue(data.error);
      const user = { ...data, tokenExpiresAt: Date.now() + 3 * 60 * 60 * 1000 };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch {
      return rejectWithValue('Network error');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async () => {
    try {
      const token = getStoredToken();
      await fetch(`${API_URL}/api/user/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (_) {}
    localStorage.removeItem('user');
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:     savedUser,
    loading:  false,
    error:    null,
    otpStep:  null,   // null | 'login' | 'signup'
    otpEmail: null,
  },
  reducers: {
    logout(state) {
      state.user     = null;
      state.error    = null;
      state.otpStep  = null;
      state.otpEmail = null;
      localStorage.removeItem('user');
    },
    clearError(state) {
      state.error = null;
    },
    clearOtpStep(state) {
      state.otpStep  = null;
      state.otpEmail = null;
      state.error    = null;
    },
    sessionExpired(state) {
      state.user     = null;
      state.error    = null;
      state.otpStep  = null;
      state.otpEmail = null;
      localStorage.removeItem('user');
    },
  },
  extraReducers: (builder) => {
    builder
      // sendLoginOtp
      .addCase(sendLoginOtp.pending,   (state) => { state.loading = true;  state.error = null; })
      .addCase(sendLoginOtp.fulfilled, (state, action) => {
        state.loading  = false;
        state.otpStep  = 'login';
        state.otpEmail = action.payload.email;
      })
      .addCase(sendLoginOtp.rejected,  (state, action) => { state.loading = false; state.error = action.payload; })
      // verifyLoginOtp
      .addCase(verifyLoginOtp.pending,   (state) => { state.loading = true;  state.error = null; })
      .addCase(verifyLoginOtp.fulfilled, (state, action) => {
        state.loading  = false;
        state.user     = action.payload;
        state.otpStep  = null;
        state.otpEmail = null;
      })
      .addCase(verifyLoginOtp.rejected,  (state, action) => { state.loading = false; state.error = action.payload; })
      // sendSignupOtp
      .addCase(sendSignupOtp.pending,   (state) => { state.loading = true;  state.error = null; })
      .addCase(sendSignupOtp.fulfilled, (state, action) => {
        state.loading  = false;
        state.otpStep  = 'signup';
        state.otpEmail = action.payload.email;
      })
      .addCase(sendSignupOtp.rejected,  (state, action) => { state.loading = false; state.error = action.payload; })
      // verifySignupOtp
      .addCase(verifySignupOtp.pending,   (state) => { state.loading = true;  state.error = null; })
      .addCase(verifySignupOtp.fulfilled, (state, action) => {
        state.loading  = false;
        state.user     = action.payload;
        state.otpStep  = null;
        state.otpEmail = null;
      })
      .addCase(verifySignupOtp.rejected,  (state, action) => { state.loading = false; state.error = action.payload; })
      // logoutUser
      .addCase(logoutUser.fulfilled, (state) => {
        state.user     = null;
        state.error    = null;
        state.otpStep  = null;
        state.otpEmail = null;
      })
      // refreshUser
      .addCase(refreshUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(refreshUser.rejected, (state) => {
        state.user = null;
        localStorage.removeItem('user');
      });
  }
})

export const { logout, clearError, clearOtpStep, sessionExpired } = authSlice.actions
export default authSlice.reducer
