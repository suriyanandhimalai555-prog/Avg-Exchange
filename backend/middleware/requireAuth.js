const jwt = require('jsonwebtoken');
const db = require('../db');

const requireAuth = async (req, res, next) => {
  // Accept token from cookie (desktop) OR Authorization: Bearer header (mobile/iOS Safari)
  const { token: cookieToken } = req.cookies;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  try {
    const { id } = jwt.verify(token, process.env.SECRET);
    const result = await db.query('SELECT id, email, is_admin FROM "User" WHERE id = $1', [id]);
    req.user = result.rows[0];

    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Request is not authorized' });
  }
};

module.exports = requireAuth;
