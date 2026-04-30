import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../features/authSlice'
import balanceReducer from '../features/balanceSlice'

export const store = configureStore({
	reducer: {
		auth: authReducer,
		balance: balanceReducer,
	}
})

export default store

