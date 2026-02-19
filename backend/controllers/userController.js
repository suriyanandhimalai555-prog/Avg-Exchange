const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const validator = require('validator');
const crypto = require('crypto');

// Helper: Create Token with dynamic expiration
const createToken = (id, expiresIn) => {
  return jwt.sign({ id }, process.env.SECRET, { expiresIn });
};

// Helper: Generate a random referral code (e.g., "AVG-X7Z9")
const generateReferralCode = () => {
  return 'AVG-' + crypto.randomBytes(3).toString('hex').toUpperCase();
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
    
    const newReferralCode = generateReferralCode();

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
    
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 3 * 24 * 60 * 60 * 1000 });
    
    res.status(200).json({ email, name: user.name, referralCode: user.referral_code });

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
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge });
    
    res.status(200).json({ email, name: user.name, referralCode: user.referral_code });
  } catch (error) {
    res.status(400);
    next(error);
  }
};

module.exports = { signupUser, loginUser };