// frontend/src/components/dashboard/DepositModal.jsx
// OxaPay deposit: creates an invoice, polls for payment confirmation.
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  IoArrowDownOutline, IoCloseOutline,
  IoAlertCircleOutline, IoCheckmarkCircleOutline,
  IoOpenOutline, IoRefreshOutline,
} from 'react-icons/io5';
import API_URL from '../../config/api';

const COINS = [
  { symbol: 'USDT', color: '#26a17b' },
  { symbol: 'BTC',  color: '#f7931a' },
  { symbol: 'ETH',  color: '#627eea' },
  { symbol: 'BNB',  color: '#f3ba2f' },
  { symbol: 'SOL',  color: '#9945ff' },
  { symbol: 'TRX',  color: '#e50914' },
  { symbol: 'LTC',  color: '#bfbbbb' },
];

const QUICK_AMOUNTS = {
  USDT: [100, 500, 1000, 5000],
  BTC:  [0.001, 0.01, 0.1, 1],
  default: [1, 10, 100, 500],
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

// ── OxaPay payment status poller ──────────────────────────────────────────────
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX         = 72;      // 72 × 5 s = 6 min

const OxaPayStatus = ({ trackId, currency, amount, payLink, onPaid, onExpired }) => {
  const [status,   setStatus]   = useState('Waiting');
  const [attempts, setAttempts] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(async () => {
      setAttempts(prev => {
        if (prev >= POLL_MAX) {
          clearInterval(timerRef.current);
          onExpired();
          return prev;
        }
        return prev + 1;
      });

      try {
        const { data } = await axios.get(
          `${API_URL}/api/payment/status/${trackId}`,
          { withCredentials: true }
        );
        setStatus(data.status);
        if (data.status === 'Paid') {
          clearInterval(timerRef.current);
          onPaid();
        } else if (data.status === 'Expired' || data.status === 'Error') {
          clearInterval(timerRef.current);
          onExpired();
        }
      } catch (_) {}
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timerRef.current);
  }, [trackId]);

  const isPaid = status === 'Paid';

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      {isPaid ? (
        <>
          <IoCheckmarkCircleOutline size={48} className="text-[#0ecb81]" />
          <div>
            <p className="font-bold text-[#0ecb81] text-base">Payment Confirmed!</p>
            <p className="text-[#848e9c] text-sm mt-1">
              {amount} {currency} has been credited to your account.
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Step 1: Open checkout */}
          <div className="w-full bg-[#2b3139] border border-[#363c45] rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs text-[#848e9c] font-semibold uppercase tracking-wide">Step 1 — Complete payment</p>

            {payLink ? (
              <a
                href={payLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-[#f0b90b] hover:bg-[#d4a300] text-black font-bold text-sm rounded-xl transition-colors active:scale-[0.98]"
              >
                <IoOpenOutline size={16} />
                Open OxaPay Checkout
              </a>
            ) : (
              <p className="text-[#f6465d] text-xs text-center">
                No checkout URL returned — check backend logs for the OxaPay response.
              </p>
            )}

            {payLink && (
              <p className="text-[#848e9c] text-[10px] text-center break-all">
                {payLink}
              </p>
            )}
          </div>

          {/* Step 2: Auto-detecting */}
          <div className="w-full bg-[#2b3139] border border-[#363c45] rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs text-[#848e9c] font-semibold uppercase tracking-wide">Step 2 — Auto-detecting payment</p>
            <div className="flex items-center justify-between">
              <p className="text-[#eaecef] text-xs flex items-center gap-1.5">
                <IoRefreshOutline size={12} className="animate-spin text-[#f0b90b]" />
                Checking status…
              </p>
              <span className="text-[#848e9c] text-xs">
                Status: <span className="text-[#f0b90b]">{status}</span>
              </span>
            </div>
            <div className="w-full bg-[#363c45] rounded-full h-1 mt-1">
              <div
                className="bg-[#f0b90b] h-1 rounded-full transition-all duration-500"
                style={{ width: `${(attempts / POLL_MAX) * 100}%` }}
              />
            </div>
            <p className="text-[#848e9c] text-[10px]">
              Expires in {Math.max(0, POLL_MAX - attempts) * 5}s — page will update automatically when payment is confirmed.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// ── Main modal ─────────────────────────────────────────────────────────────────
const DepositModal = ({ open, onClose, onSuccess }) => {
  const [coin,     setCoin]     = useState('USDT');
  const [amount,   setAmount]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [invoice,  setInvoice]  = useState(null);  // { trackId, payLink, currency, amount }

  if (!open) return null;

  const quickAmounts = QUICK_AMOUNTS[coin] ?? QUICK_AMOUNTS.default;

  const handleClose = () => {
    setFeedback(null);
    setAmount('');
    setInvoice(null);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/payment/invoice`,
        { currency: coin, amount: amt },
        { withCredentials: true }
      );
      setInvoice(data);
      // Note: we do NOT window.open() here — browsers block async-triggered popups.
      // The OxaPayStatus component shows a prominent button the user clicks directly.
    } catch (err) {
      setFeedback({ type: 'error', message: err?.response?.data?.error || 'Failed to create invoice' });
    } finally {
      setLoading(false);
    }
  };

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
            <h2 className="font-bold text-[#eaecef] text-base">Deposit Funds</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors">
            <IoCloseOutline size={20} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">

          {/* OxaPay payment waiting screen */}
          {invoice ? (
            <OxaPayStatus
              trackId={invoice.trackId}
              currency={invoice.currency}
              amount={invoice.amount}
              payLink={invoice.payLink}
              onPaid={() => {
                setFeedback({ type: 'success', message: `${invoice.amount} ${invoice.currency} credited to your account!` });
                setInvoice(null);
                setAmount('');
                onSuccess && onSuccess(invoice.currency, invoice.amount);
              }}
              onExpired={() => {
                setFeedback({ type: 'error', message: 'Invoice expired. Please try again.' });
                setInvoice(null);
              }}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

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
                      onClick={() => { setCoin(symbol); setAmount(''); }}
                    />
                  ))}
                </div>
              </div>

              {/* Amount */}
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
                className="w-full py-3 font-bold rounded-xl transition-colors active:scale-[0.98]
                  disabled:opacity-40 disabled:cursor-not-allowed
                  bg-[#f0b90b] hover:bg-[#d4a300] text-black"
              >
                {loading ? 'Creating invoice…' : `Pay ${amount || '0'} ${coin} via OxaPay`}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default DepositModal;
