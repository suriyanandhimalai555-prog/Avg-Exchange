/**
 * middleware/errorHandler.js — Global Express error handler.
 */

'use strict';

const config = require('../config');

const errorHandler = (err, req, res, _next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    error: err.message,
    stack: config.isProduction ? null : err.stack,
  });
};

module.exports = { errorHandler };
