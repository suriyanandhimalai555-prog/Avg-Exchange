// frontend/src/components/dashboard/DepositModal.jsx
// Standalone, reusable deposit modal — decoupled from any page state.
// Props:
//   open       {boolean}  — controls visibility
//   onClose    {function} — called when user dismisses
//   onSuccess  {async function(currency, amount)} — called on submit; should throw on error
import React, { useState } from 'react';
import {
  IoArrowDownOutline, IoCloseOutline,
  IoAlertCircleOutline, IoCheckmarkCircleOutline,
} from 'react-icons/io5';

const COINS = [
  { symbol: 'USDT', color: '#26a17b' },
  { symbol: 'BTC',  color: '#f7931a' },
  { symbol: 'ETH',  color: '#627eea' },
  { symbol: 'BNB',  color: '#f3ba2f' },
  { symbol: 'SOL',  color: '#9945ff' },
  { symbol: 'XRP',  color: '#00aae4' },
  { symbol: 'ADA',  color: '#0d4c91' },
  { symbol: 'DOGE', color: '#c2a633' },
  { symbol: 'AVAX', color: '#e84142' },
  { symbol: 'MATIC',color: '#8247e5' },
];

const QUICK_AMOUNTS = {
  USDT:  [1_000, 5_000, 10_000, 50_000],
  BTC:   [0.01, 0.1, 1, 10],
  default: [0.1, 1, 10, 100],
};

const DepositModal = ({ open, onClose, onSuccess }) => {
  const [coin,     setCoin]     = useState('USDT');
  const [amount,   setAmount]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }

  if (!open) return null;

  const quickAmounts = QUICK_AMOUNTS[coin] ?? QUICK_AMOUNTS.default;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setFeedback(null);
    try {
      await onSuccess(coin, amt);
      setFeedback({ type: 'success', message: `${amt.toLocaleString()} ${coin} deposited successfully` });
      setAmount('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error || err?.message || 'Deposit failed',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFeedback(null);
    setAmount('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[#1e2329] border border-[#2b3139] rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f0b90b]/10 flex items-center justify-center">
              <IoArrowDownOutline className="text-[#f0b90b]" size={18} />
            </div>
            <h2 className="font-bold text-[#eaecef] text-base">Deposit Funds</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors"
          >
            <IoCloseOutline size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">

          {/* Testnet notice */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-xl">
            <IoAlertCircleOutline className="text-[#f0b90b] shrink-0 mt-px" size={15} />
            <p className="text-xs text-[#848e9c] leading-relaxed">
              <strong className="text-[#f0b90b]">Testnet only.</strong> Deposited funds are virtual and carry no real value.
            </p>
          </div>

          {/* Coin selector */}
          <div>
            <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
              Select Coin
            </label>
            <div className="grid grid-cols-5 gap-2">
              {COINS.map(({ symbol, color }) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => { setCoin(symbol); setAmount(''); }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-bold transition-all
                    ${coin === symbol
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
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
              Amount
            </label>
            <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded-xl flex items-center px-4 py-3 transition-colors mb-2.5">
              <input
                type="number"
                required
                min="0.000001"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-[#eaecef] text-base w-full outline-none font-mono placeholder-[#848e9c]"
              />
              <span className="text-[#848e9c] text-sm font-bold pl-3 shrink-0">{coin}</span>
            </div>

            {/* Quick-fill buttons */}
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(String(amt))}
                  className="py-1.5 text-xs font-semibold text-[#848e9c] border border-[#363c45]
                             rounded-lg bg-[#2b3139] hover:border-[#f0b90b] hover:text-[#f0b90b]
                             transition-colors"
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm
              ${feedback.type === 'success'
                ? 'bg-[#0ecb81]/10 border border-[#0ecb81]/20 text-[#0ecb81]'
                : 'bg-[#f6465d]/10 border border-[#f6465d]/20 text-[#f6465d]'}`}
            >
              {feedback.type === 'success'
                ? <IoCheckmarkCircleOutline size={17} className="shrink-0" />
                : <IoAlertCircleOutline size={17} className="shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full py-3 bg-[#f0b90b] hover:bg-[#d4a300]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-black font-bold rounded-xl transition-colors active:scale-[0.98]"
          >
            {loading ? 'Processing…' : `Deposit ${coin}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DepositModal;
