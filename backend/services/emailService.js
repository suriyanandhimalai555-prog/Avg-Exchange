/**
 * emailService.js — Decoupled, async email delivery
 *
 * All email in the application goes through this single service.
 * Sending is fire-and-forget by default — callers should never
 * block a user request waiting for SMTP. Use sendMail() for
 * non-blocking sends and sendMailSync() when you need to await.
 *
 * Environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If SMTP is not configured the service logs a warning and
 * silently skips delivery so the rest of the app keeps working.
 */

'use strict';

const nodemailer = require('nodemailer');

// ── Configuration ────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || `"AvgExchange" <noreply@avgexchange.io>`;

const IS_CONFIGURED = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

if (!IS_CONFIGURED) {
  console.warn('[email] SMTP not configured — emails will be logged but not sent');
}

// ── Transporter (singleton) ──────────────────────────────────────
const transporter = IS_CONFIGURED
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      pool: true,          // keep connections alive
      maxConnections: 3,
      maxMessages: 50,
      tls: { rejectUnauthorized: false },
    })
  : null;

// Verify SMTP connection on startup (non-blocking)
if (transporter) {
  transporter.verify()
    .then(() => console.log('[email] SMTP connection verified'))
    .catch((err) => console.error('[email] SMTP verification failed:', err.message));
}

// ── Core send ────────────────────────────────────────────────────

/**
 * Send an email. Returns a promise but callers are encouraged
 * to NOT await it — let it fly in the background.
 *
 * @param {object}  opts
 * @param {string}  opts.to       recipient email
 * @param {string}  opts.subject  email subject
 * @param {string}  opts.html     HTML body
 * @param {string}  [opts.text]   plain-text fallback (auto-stripped from html if omitted)
 */
const sendMailSync = async ({ to, subject, html, text }) => {
  if (!to || !subject || !html) {
    console.warn('[email] sendMail called with missing fields — skipping');
    return;
  }

  if (!transporter) {
    console.log(`[email] (no SMTP) To: ${to} | Subject: ${subject}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    console.log(`[email] Sent to ${to} — messageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err.message);
  }
};

/**
 * Fire-and-forget wrapper. Never throws, never blocks the caller.
 */
const sendMail = (opts) => {
  sendMailSync(opts).catch(() => {});
};

// ── Template helpers ─────────────────────────────────────────────

const BRAND_COLOR = '#f0b90b';
const BG_COLOR    = '#0b0e11';
const CARD_COLOR  = '#1e2329';
const TEXT_COLOR  = '#eaecef';
const MUTED_COLOR = '#848e9c';

/**
 * Wraps content in the standard AvgExchange email layout.
 */
const wrapLayout = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD_COLOR};border-radius:12px;border:1px solid #2b3139;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:28px 32px 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;color:${BRAND_COLOR};font-weight:800;letter-spacing:-0.5px;">AvgExchange</h1>
        </td></tr>
        <!-- Title -->
        <tr><td style="padding:20px 32px 0;text-align:center;">
          <h2 style="margin:0;font-size:18px;color:${TEXT_COLOR};font-weight:700;">${title}</h2>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:20px 32px 32px;color:${TEXT_COLOR};font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #2b3139;text-align:center;">
          <p style="margin:0;font-size:11px;color:${MUTED_COLOR};">
            This is an automated message from AvgExchange. Please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Pre-built email templates ────────────────────────────────────

/**
 * Password reset email with a 6-digit OTP code.
 */
const sendPasswordResetEmail = (to, code, expiresMinutes = 15) => {
  const html = wrapLayout('Password Reset', `
    <p style="color:${MUTED_COLOR};margin:0 0 16px;">
      You requested a password reset for your AvgExchange account.
      Use the code below to set a new password. It expires in <strong style="color:${TEXT_COLOR};">${expiresMinutes} minutes</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:${BG_COLOR};border:2px solid ${BRAND_COLOR};border-radius:8px;padding:16px 40px;letter-spacing:8px;font-size:32px;font-weight:800;color:${BRAND_COLOR};font-family:monospace;">
        ${code}
      </div>
    </div>
    <p style="color:${MUTED_COLOR};margin:16px 0 0;font-size:12px;">
      If you did not request this, you can safely ignore this email. Your password will not be changed.
    </p>
  `);

  sendMail({ to, subject: `${code} — AvgExchange Password Reset`, html });
};

/**
 * Trade execution notification.
 *
 * @param {string} to         recipient email
 * @param {object} trade      trade row from DB
 * @param {'buy'|'sell'} role  whether this user was the buyer or seller
 * @param {string} pair       e.g. 'BTC/USDT'
 */
const sendTradeNotification = (to, { price, quantity, executed_at }, role, pair) => {
  const [base, quote] = pair.split('/');
  const total   = (parseFloat(price) * parseFloat(quantity)).toFixed(2);
  const isBuy   = role === 'buy';
  const action  = isBuy ? 'Bought' : 'Sold';
  const color   = isBuy ? '#0ecb81' : '#f6465d';
  const arrow   = isBuy ? '&darr;' : '&uarr;';
  const dateStr = new Date(executed_at).toUTCString();

  const html = wrapLayout('Trade Executed', `
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;background:${color}20;color:${color};font-weight:700;font-size:14px;padding:6px 18px;border-radius:6px;border:1px solid ${color}40;">
        ${arrow} ${action} ${parseFloat(quantity).toFixed(6)} ${base}
      </span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};border-bottom:1px solid #2b3139;">Pair</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT_COLOR};font-weight:600;border-bottom:1px solid #2b3139;">${pair}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};border-bottom:1px solid #2b3139;">Side</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:${color};border-bottom:1px solid #2b3139;">${action.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};border-bottom:1px solid #2b3139;">Price</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT_COLOR};font-weight:600;font-family:monospace;border-bottom:1px solid #2b3139;">$${parseFloat(price).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};border-bottom:1px solid #2b3139;">Quantity</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT_COLOR};font-weight:600;font-family:monospace;border-bottom:1px solid #2b3139;">${parseFloat(quantity).toFixed(6)} ${base}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};border-bottom:1px solid #2b3139;">Total</td>
        <td style="padding:8px 0;text-align:right;color:${BRAND_COLOR};font-weight:700;font-family:monospace;border-bottom:1px solid #2b3139;">$${total} ${quote}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED_COLOR};">Time</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT_COLOR};font-size:12px;">${dateStr}</td>
      </tr>
    </table>
  `);

  sendMail({ to, subject: `${action} ${parseFloat(quantity).toFixed(6)} ${base} @ $${parseFloat(price).toLocaleString()} — AvgExchange`, html });
};

/**
 * OTP verification email for login and signup flows.
 *
 * @param {string} to          recipient email
 * @param {string} code        6-digit OTP code
 * @param {'login'|'signup'} purpose
 */
const sendOtpEmail = (to, code, purpose = 'login') => {
  const title = purpose === 'signup' ? 'Verify Your Email' : 'Login Verification';
  const description = purpose === 'signup'
    ? 'Use this code to complete your AvgExchange account registration.'
    : 'Use this code to complete your login to AvgExchange.';

  const html = wrapLayout(title, `
    <p style="color:${MUTED_COLOR};margin:0 0 16px;">
      ${description}
      It expires in <strong style="color:${TEXT_COLOR};">10 minutes</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:${BG_COLOR};border:2px solid ${BRAND_COLOR};border-radius:8px;padding:16px 40px;letter-spacing:8px;font-size:32px;font-weight:800;color:${BRAND_COLOR};font-family:monospace;">
        ${code}
      </div>
    </div>
    <p style="color:${MUTED_COLOR};margin:16px 0 0;font-size:12px;">
      If you did not request this, you can safely ignore this email.
    </p>
  `);

  sendMail({ to, subject: `${code} — AvgExchange Verification Code`, html });
};

module.exports = {
  sendMail,
  sendMailSync,
  sendPasswordResetEmail,
  sendTradeNotification,
  sendOtpEmail,
};
