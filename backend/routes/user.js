const express = require('express')
const rateLimit = require('express-rate-limit');

// controller functions
const { loginUser, signupUser } = require('../controllers/userController')

const router = express.Router()


// Limit to 5 requests per 15 minutes for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { error: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});


// login route
router.post('/login',authLimiter, loginUser)

// signup route
router.post('/signup',authLimiter, signupUser)

module.exports = router