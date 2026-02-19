const jwt = require('jsonwebtoken')
const db = require('../db') 

const requireAuth = async (req, res, next) => {
  const { token } = req.cookies

  if (!token) {
    return res.status(401).json({error: 'Authorization token required'})
  }

  try {
    const { id } = jwt.verify(token, process.env.SECRET)

    // Use SQL query instead of Mongoose findOne
    const result = await db.query('SELECT id, email FROM "User" WHERE id = $1', [id]);
    req.user = result.rows[0];

    if (!req.user) {
      throw Error('User not found');
    }

    next()
  } catch (error) {
    console.log(error)
    res.status(401).json({error: 'Request is not authorized'})
  }
}

module.exports = requireAuth