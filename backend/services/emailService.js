/**
 * emailService.js — Decoupled, async email delivery.
 *
 * All email in the application goes through this single service.
 * Sending is fire-and-forget by default — callers should never
 * block a user request waiting for SMTP.
 */

'use strict';

const nodemailer = require('nodemailer');
const config     = require('../config');

// ── Configuration ────────────────────────────────────────────────
const { host, port, user, pass, from } = config.smtp;
const IS_CONFIGURED = !!(host && user && pass);

if (!IS_CONFIGURED) {
  console.warn('[email] SMTP not configured — emails will be logged but not sent');
}

// ── Transporter (singleton) ──────────────────────────────────────
const transporter = IS_CONFIGURED
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      tls: { rejectUnauthorized: false },
    })
  : null;

if (transporter) {
  transporter.verify()
    .then(() => console.log('[email] SMTP connection verified'))
    .catch((err) => console.error('[email] SMTP verification failed:', err.message));
}

// ── Core send ────────────────────────────────────────────────────
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
      from,
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

const sendMail = (opts) => {
  sendMailSync(opts).catch(() => {});
};

// ── Email layout ─────────────────────────────────────────────────
const BRAND  = '#f0b90b';
const BG     = '#0b0e11';
const CARD   = '#1e2329';
const TEXT   = '#eaecef';
const MUTED  = '#848e9c';

const wrapLayout = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD};border-radius:12px;border:1px solid #2b3139;overflow:hidden;">
        <tr><td style="padding:28px 32px 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;color:${BRAND};font-weight:800;letter-spacing:-0.5px;">AvgExchange</h1>
        </td></tr>
        <tr><td style="padding:20px 32px 0;text-align:center;">
          <h2 style="margin:0;font-size:18px;color:${TEXT};font-weight:700;">${title}</h2>
        </td></tr>
        <tr><td style="padding:20px 32px 32px;color:${TEXT};font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #2b3139;text-align:center;">
          <p style="margin:0;font-size:11px;color:${MUTED};">
            This is an automated message from AvgExchange. Please do not reply.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Templates ────────────────────────────────────────────────────

const sendPasswordResetEmail = (to, code, expiresMinutes = 15) => {
  const html = wrapLayout('Password Reset', `
    <p style="color:${MUTED};margin:0 0 16px;">
      You requested a password reset for your AvgExchange account.
      Use the code below to set a new password. It expires in <strong style="color:${TEXT};">${expiresMinutes} minutes</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:${BG};border:2px solid ${BRAND};border-radius:8px;padding:16px 40px;letter-spacing:8px;font-size:32px;font-weight:800;color:${BRAND};font-family:monospace;">
        ${code}
      </div>
    </div>
    <p style="color:${MUTED};margin:16px 0 0;font-size:12px;">
      If you did not request this, you can safely ignore this email.
    </p>
  `);
  sendMail({ to, subject: `${code} — AvgExchange Password Reset`, html });
};

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
        <td style="padding:8px 0;color:${MUTED};border-bottom:1px solid #2b3139;">Pair</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT};font-weight:600;border-bottom:1px solid #2b3139;">${pair}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED};border-bottom:1px solid #2b3139;">Side</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:${color};border-bottom:1px solid #2b3139;">${action.toUpperCase()}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED};border-bottom:1px solid #2b3139;">Price</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT};font-weight:600;font-family:monospace;border-bottom:1px solid #2b3139;">$${parseFloat(price).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED};border-bottom:1px solid #2b3139;">Quantity</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT};font-weight:600;font-family:monospace;border-bottom:1px solid #2b3139;">${parseFloat(quantity).toFixed(6)} ${base}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED};border-bottom:1px solid #2b3139;">Total</td>
        <td style="padding:8px 0;text-align:right;color:${BRAND};font-weight:700;font-family:monospace;border-bottom:1px solid #2b3139;">$${total} ${quote}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${MUTED};">Time</td>
        <td style="padding:8px 0;text-align:right;color:${TEXT};font-size:12px;">${dateStr}</td>
      </tr>
    </table>
  `);
  sendMail({ to, subject: `${action} ${parseFloat(quantity).toFixed(6)} ${base} @ $${parseFloat(price).toLocaleString()} — AvgExchange`, html });
};

const sendOtpEmail = (to, code, purpose = 'login') => {
  const title = purpose === 'signup' ? 'Verify Your Email' : 'Login Verification';
  const description = purpose === 'signup'
    ? 'Use this code to complete your AvgExchange account registration.'
    : 'Use this code to complete your login to AvgExchange.';

  const html = wrapLayout(title, `
    <p style="color:${MUTED};margin:0 0 16px;">
      ${description}
      It expires in <strong style="color:${TEXT};">10 minutes</strong>.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:${BG};border:2px solid ${BRAND};border-radius:8px;padding:16px 40px;letter-spacing:8px;font-size:32px;font-weight:800;color:${BRAND};font-family:monospace;">
        ${code}
      </div>
    </div>
    <p style="color:${MUTED};margin:16px 0 0;font-size:12px;">
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
