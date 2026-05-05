// frontend/src/components/dashboard/DepositModal.jsx
// White-Label / Static Address deposit flow.
// Each user gets a permanent blockchain address backed by an OxaPay slave account.
// No redirect — user copies the address or scans the QR and sends crypto directly.
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import QRCode from 'react-qr-code';
import {
  IoArrowDownOutline, IoCloseOutline,
  IoAlertCircleOutline, IoCheckmarkCircleOutline,
  IoCopyOutline, IoRefreshOutline,
} from 'react-icons/io5';
import { LuTriangleAlert } from 'react-icons/lu';
import API_URL from '../../config/api';

// Currency metadata
const COINS = [
  { symbol: 'USDT', color: '#26a17b', networks: ['TRX', 'ETH', 'BSC'] },
  { symbol: 'BTC',  color: '#f7931a', networks: ['BTC'] },
  { symbol: 'ETH',  color: '#627eea', networks: ['ETH'] },
  { symbol: 'BNB',  color: '#f3ba2f', networks: ['BSC'] },
  { symbol: 'SOL',  color: '#9945ff', networks: ['SOL'] },
  { symbol: 'TRX',  color: '#e50914', networks: ['TRX'] },
  { symbol: 'LTC',  color: '#bfbbbb', networks: ['LTC'] },
];

// Human-readable network labels
const NETWORK_LABELS = {
  TRX: 'Tron (TRC-20)',
  ETH: 'Ethereum (ERC-20)',
  BSC: 'BNB Smart Chain (BEP-20)',
  BTC: 'Bitcoin',
  SOL: 'Solana',
  LTC: 'Litecoin',
};

// Minimum deposit warnings per network
const MIN_DEPOSIT = {
  TRX: '1 USDT',
  ETH: '10 USDT',
  BSC: '1 USDT',
  BTC: '0.0001 BTC',
  SOL: '0.01 SOL',
  LTC: '0.01 LTC',
};

const CoinBtn = ({ symbol, color, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-bold transition-all
      ${selected
        ? 'border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b] shadow-[0_0_0_1px_rgba(240,185,11,0.2)]'
        : 'border-[#363c45] bg-[#2b3139] text-[#848e9c] hover:border-[#848e9c] hover:text-[#eaecef]'
      }`}
  >
    <div
      className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
      style={{ background: color }}
    >
      {symbol.slice(0, 2)}
    </div>
    {symbol}
  </button>
);

const DepositModal = ({ open, onClose, onSuccess }) => {
  const [coin,     setCoin]     = useState('USDT');
  const [network,  setNetwork]  = useState('TRX');
  const [address,  setAddress]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState(false);

  const coinMeta   = COINS.find(c => c.symbol === coin);
  const networks   = coinMeta?.networks ?? [];

  // When coin changes, reset to first available network
  const handleCoinChange = (symbol) => {
    setCoin(symbol);
    setNetwork(COINS.find(c => c.symbol === symbol)?.networks[0] ?? 'TRX');
    setAddress(null);
    setError(null);
  };

  const fetchAddress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(
        `${API_URL}/api/payment/address/${coin}/${network}`,
        { withCredentials: true }
      );
      setAddress(data.address);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate deposit address. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [coin, network]);

  // Fetch address whenever coin or network changes (while modal is open)
  useEffect(() => {
    if (!open) return;
    fetchAddress();
  }, [open, fetchAddress]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setAddress(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-[#1e2329] border border-[#2b3139] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f0b90b]/10 flex items-center justify-center">
              <IoArrowDownOutline className="text-[#f0b90b]" size={18} />
            </div>
            <h2 className="font-bold text-[#eaecef] text-base">Deposit Crypto</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors">
            <IoCloseOutline size={20} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Coin selector */}
          <div>
            <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
              Select Coin
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COINS.map(({ symbol, color }) => (
                <CoinBtn
                  key={symbol}
                  symbol={symbol}
                  color={color}
                  selected={coin === symbol}
                  onClick={() => handleCoinChange(symbol)}
                />
              ))}
            </div>
          </div>

          {/* Network selector */}
          {networks.length > 1 && (
            <div>
              <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
                Network
              </label>
              <div className="flex flex-wrap gap-2">
                {networks.map(net => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => { setNetwork(net); setAddress(null); setError(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      network === net
                        ? 'border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]'
                        : 'border-[#363c45] bg-[#2b3139] text-[#848e9c] hover:border-[#848e9c] hover:text-[#eaecef]'
                    }`}
                  >
                    {NETWORK_LABELS[net] ?? net}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Address + QR */}
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-2 border-[#f0b90b] border-t-transparent rounded-full animate-spin" />
              <p className="text-[#848e9c] text-sm">Generating your deposit address…</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-[#f6465d]/10 border border-[#f6465d]/20 text-[#f6465d] text-sm">
              <IoAlertCircleOutline size={17} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={fetchAddress}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  <IoRefreshOutline size={12} /> Try again
                </button>
              </div>
            </div>
          ) : address ? (
            <div className="flex flex-col gap-4">
              {/* QR Code */}
              <div className="flex justify-center bg-white rounded-xl p-4">
                <QRCode value={address} size={160} />
              </div>

              {/* Address display */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#848e9c] font-semibold uppercase tracking-wider">
                    {coin} Address ({NETWORK_LABELS[network] ?? network})
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs font-semibold text-[#f0b90b] hover:opacity-80 transition-opacity"
                  >
                    {copied
                      ? <><IoCheckmarkCircleOutline size={13} /> Copied!</>
                      : <><IoCopyOutline size={13} /> Copy</>
                    }
                  </button>
                </div>
                <div
                  onClick={handleCopy}
                  className="bg-[#2b3139] border border-[#363c45] hover:border-[#f0b90b] rounded-xl px-4 py-3 cursor-pointer transition-colors group"
                >
                  <p className="text-[#eaecef] text-xs font-mono break-all group-hover:text-[#f0b90b] transition-colors">
                    {address}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-xl px-3 py-2.5">
                  <LuTriangleAlert size={14} className="text-[#f0b90b] shrink-0 mt-0.5" />
                  <div className="text-[11px] text-[#848e9c] leading-relaxed">
                    <p>Only send <span className="text-[#eaecef] font-bold">{coin}</span> on the <span className="text-[#eaecef] font-bold">{NETWORK_LABELS[network] ?? network}</span> network to this address.</p>
                    <p className="mt-0.5">Sending any other coin or using the wrong network will result in <span className="text-[#f6465d] font-semibold">permanent loss of funds</span>.</p>
                    {MIN_DEPOSIT[network] && (
                      <p className="mt-0.5">Minimum deposit: <span className="text-[#eaecef] font-semibold">{MIN_DEPOSIT[network]}</span></p>
                    )}
                  </div>
                </div>
                <p className="text-[#848e9c] text-[11px] text-center">
                  This is your permanent address — it can be reused for future deposits.
                  Your balance updates automatically after network confirmation.
                </p>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
};

export default DepositModal;
