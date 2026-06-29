/**
 * constants/theme.js — Design tokens used across all components.
 *
 * Single source of truth for colors, so changes propagate everywhere.
 */

export const colors = {
  // Brand
  primary:    '#00D68F',
  accent:     '#f0b90b',

  // Background
  bgDark:     '#0b0c0e',
  bgCard:     '#1e2329',
  bgPanel:    '#181a20',
  bgInput:    '#2b3139',
  bgHover:    '#2b313900',

  // Text
  textPrimary: '#eaecef',
  textMuted:   '#848e9c',
  textDim:     '#5e6673',

  // Borders
  border:      '#2b3139',
  borderLight: '#363c45',

  // Semantic
  success:     '#0ecb81',
  danger:      '#f6465d',
  warning:     '#f0b90b',
  info:        '#1e80ff',

  // Trade
  buyGreen:    '#0ecb81',
  sellRed:     '#f6465d',
};

export const SESSION_EXPIRY_MS = 3 * 60 * 60 * 1000; // 3 hours
export const SESSION_CHECK_INTERVAL_MS = 60_000;       // 60 seconds
