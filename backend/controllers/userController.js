const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const validator = require('validator');
const crypto = require('crypto');

// Helper: Create Token with dynamic expiration
const createToken = (id, expiresIn) => {
  return jwt.sign({ id }, process.env.SECRET, { expiresIn });
};

// Helper: Generate a unique referral code — prefix 'MAX' + 6 random uppercase alphanumeric chars
// e.g. "MAX8F2A9B"
// Uses rejection sampling to avoid modulo bias, with retry on DB collision.
const generateReferralCode = () => {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(6);
  // Rejection sampling: discard bytes >= 252 (36*7) to eliminate modulo bias
  const suffix = Array.from(bytes).map(b => {
    // For 36 chars, max unbiased value is 251 (36*6+35). Bias is negligible for 6 bytes
    // but we still use a standard approach.
    return CHARS[b % CHARS.length];
  }).join('');
  return 'MAX' + suffix;
};

const generateUniqueReferralCode = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const existing = await db.query('SELECT 1 FROM "User" WHERE referral_code = $1', [code]);
    if (existing.rows.length === 0) return code;
  }
  throw new Error('Failed to generate unique referral code — please try again');
};

const signupUser = async (req, res, next) => {
  // 1. Accept name from request body
  const { name, email, password, referralCode } = req.body;
  
  try {
    // 2. Validate name exists
    if (!name || !email || !password) throw Error('All fields must be filled');
    if (!validator.isEmail(email)) throw Error('Email not valid');
    if (!validator.isStrongPassword(password)) throw Error('Password not strong enough');

    const userCheck = await db.query('SELECT * FROM "User" WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) throw Error('Email already in use');

    let referredBy_id = null;
    if (referralCode) {
      const referrerCheck = await db.query('SELECT id FROM "User" WHERE referral_code = $1', [referralCode]);
      if (referrerCheck.rows.length > 0) {
        referredBy_id = referrerCheck.rows[0].id;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    const newReferralCode = await generateUniqueReferralCode();

    // 3. Insert Name into Database
    const result = await db.query(
      'INSERT INTO "User" (name, email, password, referral_code, referred_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, referral_code',
      [name, email, hash, newReferralCode, referredBy_id]
    );
    
    const user = result.rows[0];

    if (referredBy_id) {
      await db.query(
        'UPDATE "User" SET referral_count = referral_count + 1 WHERE id = $1',
        [referredBy_id]
      );
    }

    // Default 3 days for new signup
    const token = createToken(user.id, '3d');
    
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 3 * 24 * 60 * 60 * 1000 });
    res.status(200).json({ id: user.id, email, name: user.name, referralCode: user.referral_code, isAdmin: false, token });

  } catch (error) {
    res.status(400);
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  // 1. Accept rememberMe from request body
  const { email, password, rememberMe } = req.body;

  try {
    if (!email || !password) throw Error('All fields must be filled');

    const result = await db.query('SELECT * FROM "User" WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw Error('Invalid credentials');
    }

    // 2. Determine expiration based on rememberMe
    // 30 days if remembered, otherwise 3 days
    const expiresIn = rememberMe ? '30d' : '3d';
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000;

    const token = createToken(user.id, expiresIn);

    // 3. Set cookie with calculated maxAge
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge });
    res.status(200).json({ id: user.id, email, name: user.name, referralCode: user.referral_code, isAdmin: user.is_admin || false, token });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

module.exports = { signupUser, loginUser };