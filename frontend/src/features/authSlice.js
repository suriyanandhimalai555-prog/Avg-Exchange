import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../api';
import { SESSION_EXPIRY_MS } from '../constants/theme';

const savedUser = (() => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
})();

function persistUser(data) {
  const user = { ...data, tokenExpiresAt: Date.now() + SESSION_EXPIRY_MS };
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

function getStoredField(field) {
  try { return JSON.parse(localStorage.getItem('user') || '{}')[field] ?? null; }
  catch { return null; }
}

// Silently re-fetches the user profile using the existing cookie
export const refreshUser = createAsyncThunk(
  'auth/refreshUser',
  async (_, { rejectWithValue }) => {
    try {
      const res = await authApi.getMe();
      // If a logout/sessionExpired cleared storage while this request was in
      // flight, there is no token to act on — don't resurrect the session.
      const token = getStoredField('token');
      if (!token) return rejectWithValue(null);
      const data = res.data;
      const user = {
        id:             data.id,
        email:          data.email,
        name:           data.name,
        referralCode:   data.referral_code,
        isAdmin:        data.is_admin,
        kycStatus:      data.kyc_status,
        tokenExpiresAt: getStoredField('tokenExpiresAt') ?? (Date.now() + SESSION_EXPIRY_MS),
        token,
      };
      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch {
      return rejectWithValue(null);
    }
  }
);

export const sendLoginOtp = createAsyncThunk(
  'auth/sendLoginOtp',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { data } = await authApi.login({ email, password });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Network error');
    }
  }
);

export const verifyLoginOtp = createAsyncThunk(
  'auth/verifyLoginOtp',
  async ({ email, code }, { rejectWithValue }) => {
    try {
      const { data } = await authApi.verifyLoginOtp({ email, code });
      return persistUser(data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Network error');
    }
  }
);

export const sendSignupOtp = createAsyncThunk(
  'auth/sendSignupOtp',
  async ({ name, email, password, referralCode }, { rejectWithValue }) => {
    try {
      const { data } = await authApi.signup({ name, email, password, referralCode });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Network error');
    }
  }
);

export const verifySignupOtp = createAsyncThunk(
  'auth/verifySignupOtp',
  async ({ email, code }, { rejectWithValue }) => {
    try {
      const { data } = await authApi.verifySignupOtp({ email, code });
      return persistUser(data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.error || 'Network error');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async () => {
    try { await authApi.logout(); } catch (_) {}
    localStorage.removeItem('user');
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:     savedUser,
    loading:  false,
    error:    null,
    otpStep:  null,
    otpEmail: null,
  },
  reducers: {
    logout(state) {
      state.user = null; state.error = null; state.otpStep = null; state.otpEmail = null;
      localStorage.removeItem('user');
    },
    clearError(state) { state.error = null; },
    clearOtpStep(state) { state.otpStep = null; state.otpEmail = null; state.error = null; },
    sessionExpired(state) {
      state.user = null; state.error = null; state.otpStep = null; state.otpEmail = null;
      localStorage.removeItem('user');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendLoginOtp.pending,      (s) => { s.loading = true; s.error = null; })
      .addCase(sendLoginOtp.fulfilled,    (s, a) => { s.loading = false; s.otpStep = 'login'; s.otpEmail = a.payload.email; })
      .addCase(sendLoginOtp.rejected,     (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(verifyLoginOtp.pending,    (s) => { s.loading = true; s.error = null; })
      .addCase(verifyLoginOtp.fulfilled,  (s, a) => { s.loading = false; s.user = a.payload; s.otpStep = null; s.otpEmail = null; })
      .addCase(verifyLoginOtp.rejected,   (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(sendSignupOtp.pending,     (s) => { s.loading = true; s.error = null; })
      .addCase(sendSignupOtp.fulfilled,   (s, a) => { s.loading = false; s.otpStep = 'signup'; s.otpEmail = a.payload.email; })
      .addCase(sendSignupOtp.rejected,    (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(verifySignupOtp.pending,   (s) => { s.loading = true; s.error = null; })
      .addCase(verifySignupOtp.fulfilled, (s, a) => { s.loading = false; s.user = a.payload; s.otpStep = null; s.otpEmail = null; })
      .addCase(verifySignupOtp.rejected,  (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(logoutUser.fulfilled,      (s) => { s.user = null; s.error = null; s.otpStep = null; s.otpEmail = null; })
      .addCase(refreshUser.fulfilled,     (s, a) => { s.user = a.payload; })
      .addCase(refreshUser.rejected,      (s) => { s.user = null; localStorage.removeItem('user'); });
  },
});

export const { logout, clearError, clearOtpStep, sessionExpired } = authSlice.actions;
export default authSlice.reducer;
