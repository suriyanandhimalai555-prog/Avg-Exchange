/**
 * auth.js — Session management
 *
 * Logs into the exchange and stores the httpOnly JWT cookie.
 * Re-authenticates automatically if a request returns 401.
 */

const axios = require('axios');
const config = require('../config');

let sessionCookie = null;

const login = async () => {
  console.log(`[auth] Logging in as ${config.BOT_EMAIL}…`);

  if (!config.BOT_SECRET) {
    throw new Error('BOT_SECRET is not set — add it to your .env file');
  }

  const res = await axios.post(
    `${config.API_URL}/api/user/bot-login`,
    { email: config.BOT_EMAIL, password: config.BOT_PASSWORD, botSecret: config.BOT_SECRET },
    { validateStatus: () => true }
  );

  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const raw = res.headers['set-cookie'] ?? [];
  const entry = raw.find(c => c.startsWith('token='));
  if (!entry) throw new Error('No token cookie in login response');

  sessionCookie = entry.split(';')[0]; // "token=eyJ..."
  console.log('[auth] Session established');
  return sessionCookie;
};

const getClient = async () => {
  if (!sessionCookie) await login();

  const client = axios.create({
    baseURL: config.API_URL,
    headers: { Cookie: sessionCookie },
    validateStatus: () => true,
  });

  // Intercept 401 → re-login and retry once
  client.interceptors.response.use(async (res) => {
    if (res.status === 401) {
      console.warn('[auth] Session expired — re-authenticating…');
      await login();
      res.config.headers['Cookie'] = sessionCookie;
      return axios(res.config);
    }
    return res;
  });

  return client;
};

module.exports = { login, getClient };
