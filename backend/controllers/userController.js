const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const validator = require('validator');
const crypto = require('crypto');
const emailService = require('../services/emailService');

const SESSION_EXPIRY = '3h';
const SESSION_MAX_AGE = 3 * 60 * 60 * 1000; // 3 hours in ms
const OTP_EXPIRY_MINUTES = 10;

// Helper: Create JWT
const createToken = (id) => {
  return jwt.sign({ id }, process.env.SECRET, { expiresIn: SESSION_EXPIRY });
};

// Helper: Generate a unique referral code — prefix 'MAX' + 6 random uppercase alphanumeric chars
const generateReferralCode = () => {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(6);
  const suffix = Array.from(bytes).map(b => CHARS[b % CHARS.length]).join('');
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

// ── Login — Step 1: validate credentials, send OTP ──────────────
const loginUser = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) throw Error('All fields must be filled');

    const result = await db.query('SELECT * FROM "User" WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw Error('Invalid credentials');
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      `INSERT INTO otp_tokens (user_id, email, type, code, expires_at, used)
       VALUES ($1, $2, 'login', $3, $4, FALSE)
       ON CONFLICT (email, type) DO UPDATE
         SET user_id    = EXCLUDED.user_id,
             code       = EXCLUDED.code,
             expires_at = EXCLUDED.expires_at,
             used       = FALSE,
             created_at = NOW()`,
      [user.id, user.email.toLowerCase(), code, expiresAt]
    );

    emailService.sendOtpEmail(user.email, code, 'login');

    res.status(200).json({ otpSent: true, email: user.email });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

// ── Login — Step 2: verify OTP, issue session token ─────────────
const verifyLoginOtp = async (req, res, next) => {
  const { email, code } = req.body;

  try {
    if (!email || !code) throw Error('Email and OTP code are required');

    const { rows } = await db.query(
      `SELECT t.id, t.code, t.expires_at, t.used,
              u.id AS user_id, u.name, u.email AS user_email, u.referral_code, u.is_admin
         FROM otp_tokens t
         JOIN "User" u ON u.id = t.user_id
        WHERE t.email = $1 AND t.type = 'login'`,
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) throw Error('Invalid or expired OTP');
    const row = rows[0];

    if (row.used) throw Error('This OTP has already been used. Please log in again.');
    if (new Date() > new Date(row.expires_at)) throw Error('OTP has expired. Please log in again.');
    if (row.code !== code.trim()) throw Error('Invalid OTP code');

    await db.query('UPDATE otp_tokens SET used = TRUE WHERE id = $1', [row.id]);

    const token = createToken(row.user_id);
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: SESSION_MAX_AGE });
    res.status(200).json({
      id:           row.user_id,
      email:        row.user_email,
      name:         row.name,
      referralCode: row.referral_code,
      isAdmin:      row.is_admin || false,
      token,
    });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

// ── Signup — Step 1: validate, store pending data, send OTP ─────
const signupUser = async (req, res, next) => {
  const { name, email, password, referralCode } = req.body;

  try {
    if (!name || !email || !password) throw Error('All fields must be filled');
    if (!validator.isEmail(email)) throw Error('Email not valid');
    if (!validator.isStrongPassword(password)) throw Error('Password not strong enough');

    const userCheck = await db.query('SELECT 1 FROM "User" WHERE email = $1', [email.toLowerCase().trim()]);
    if (userCheck.rows.length > 0) throw Error('Email already in use');

    let referredById = null;
    if (referralCode) {
      const referrerCheck = await db.query('SELECT id FROM "User" WHERE referral_code = $1', [referralCode]);
      if (referrerCheck.rows.length > 0) referredById = referrerCheck.rows[0].id;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const signupData = { name, email: email.toLowerCase().trim(), passwordHash, referredById };

    await db.query(
      `INSERT INTO otp_tokens (user_id, email, type, code, signup_data, expires_at, used)
       VALUES (NULL, $1, 'signup', $2, $3, $4, FALSE)
       ON CONFLICT (email, type) DO UPDATE
         SET code        = EXCLUDED.code,
             signup_data = EXCLUDED.signup_data,
             expires_at  = EXCLUDED.expires_at,
             used        = FALSE,
             created_at  = NOW()`,
      [email.toLowerCase().trim(), code, JSON.stringify(signupData), expiresAt]
    );

    emailService.sendOtpEmail(email, code, 'signup');

    res.status(200).json({ otpSent: true, email });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

// ── Signup — Step 2: verify OTP, create user, issue session token
const verifySignupOtp = async (req, res, next) => {
  const { email, code } = req.body;

  try {
    if (!email || !code) throw Error('Email and OTP code are required');

    const { rows } = await db.query(
      `SELECT * FROM otp_tokens WHERE email = $1 AND type = 'signup'`,
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) throw Error('Invalid or expired OTP');
    const otpRow = rows[0];

    if (otpRow.used) throw Error('This OTP has already been used. Please sign up again.');
    if (new Date() > new Date(otpRow.expires_at)) throw Error('OTP has expired. Please sign up again.');
    if (otpRow.code !== code.trim()) throw Error('Invalid OTP code');

    const { name, email: storedEmail, passwordHash, referredById } = otpRow.signup_data;

    // Race-condition guard: re-check email hasn't been registered in the meantime
    const userCheck = await db.query('SELECT 1 FROM "User" WHERE email = $1', [storedEmail]);
    if (userCheck.rows.length > 0) throw Error('Email already in use');

    const newReferralCode = await generateUniqueReferralCode();

    const result = await db.query(
      'INSERT INTO "User" (name, email, password, referral_code, referred_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, referral_code',
      [name, storedEmail, passwordHash, newReferralCode, referredById]
    );
    const user = result.rows[0];

    if (referredById) {
      await db.query('UPDATE "User" SET referral_count = referral_count + 1 WHERE id = $1', [referredById]);
    }

    await db.query('UPDATE otp_tokens SET used = TRUE, user_id = $1 WHERE id = $2', [user.id, otpRow.id]);

    const token = createToken(user.id);
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: SESSION_MAX_AGE });
    res.status(200).json({
      id:           user.id,
      email:        storedEmail,
      name:         user.name,
      referralCode: user.referral_code,
      isAdmin:      false,
      token,
    });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

module.exports = { loginUser, verifyLoginOtp, signupUser, verifySignupOtp };
