import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import API_URL from '../config/api.js'

const savedUser = (() => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
})()

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
      });
  }
})

export const { logout, clearError } = authSlice.actions
export default authSlice.reducer