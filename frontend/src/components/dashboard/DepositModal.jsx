// frontend/src/components/dashboard/DepositModal.jsx
// White-Label deposit flow — user stays on site, copies address / scans QR.
// OxaPay returns a real blockchain address. We poll status via trackId.
import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'react-qr-code';
import client from '../../api/client';
import {
  IoArrowDownOutline, IoCloseOutline,
  IoAlertCircleOutline, IoCheckmarkCircleOutline,
  IoCopyOutline, IoRefreshOutline,
} from 'react-icons/io5';
import { LuTriangleAlert } from 'react-icons/lu';

const COINS = [
  { symbol: 'USDT', color: '#26a17b', networks: ['TRX', 'ETH', 'BSC'] },
  { symbol: 'BTC',  color: '#f7931a', networks: ['BTC'] },
  { symbol: 'ETH',  color: '#627eea', networks: ['ETH'] },
  { symbol: 'BNB',  color: '#f3ba2f', networks: ['BSC'] },
  { symbol: 'SOL',  color: '#9945ff', networks: ['SOL'] },
  { symbol: 'TRX',  color: '#e50914', networks: ['TRX'] },
  { symbol: 'LTC',  color: '#bfbbbb', networks: ['LTC'] },
];

const NETWORK_LABELS = {
  TRX: 'Tron (TRC-20)',
  ETH: 'Ethereum (ERC-20)',
  BSC: 'BNB Smart Chain (BEP-20)',
  BTC: 'Bitcoin',
  SOL: 'Solana',
  LTC: 'Litecoin',
};

const QUICK_AMOUNTS = [10, 50, 100, 500];
const POLL_INTERVAL = 5_000;
const POLL_MAX      = 360; // 30 min

// ── Countdown timer ────────────────────────────────────────────────────────
const useCountdown = (expiredAt) => {
  const [secs, setSecs] = useState(() =>
    expiredAt ? Math.max(0, parseInt(expiredAt) - Math.floor(Date.now() / 1000)) : null
  );
  useEffect(() => {
    if (!expiredAt) return;
    const tick = () => setSecs(Math.max(0, parseInt(expiredAt) - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiredAt]);
  const m = Math.floor((secs ?? 0) / 60).toString().padStart(2, '0');
  const s = ((secs ?? 0) % 60).toString().padStart(2, '0');
  return { display: secs == null ? '--:--' : `${m}:${s}`, expired: secs === 0 };
};

const CoinBtn = ({ symbol, color, selected, onClick }) => (
  <button type="button" onClick={onClick}
    className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-bold transition-all ${
      selected
        ? 'border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]'
        : 'border-[#363c45] bg-[#2b3139] text-[#848e9c] hover:border-[#848e9c] hover:text-[#eaecef]'
    }`}
  >
    <div className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
      style={{ background: color }}>
      {symbol.slice(0, 2)}
    </div>
    {symbol}
  </button>
);

// ── Address + QR screen (shown after payment is created) ──────────────────
const PaymentScreen = ({ payment, onPaid, onExpired, onBack }) => {
  const [status,  setStatus]  = useState('Waiting');
  const [copied,  setCopied]  = useState(false);
  const { display: countdown, expired } = useCountdown(payment.expiredAt);
  const onPaidRef    = useRef(onPaid);
  const onExpiredRef = useRef(onExpired);
  onPaidRef.current    = onPaid;
  onExpiredRef.current = onExpired;

  useEffect(() => {
    let count = 0;
    const id = setInterval(async () => {
      count++;
      if (count >= POLL_MAX) { clearInterval(id); onExpiredRef.current(); return; }
      try {
        const { data } = await client.get(`/api/payment/status/${payment.trackId}`);
        setStatus(data.status);
        if (data.status === 'Paid') { clearInterval(id); onPaidRef.current(data); }
        else if (['Expired', 'Error'].includes(data.status)) { clearInterval(id); onExpiredRef.current(); }
      } catch (_) {}
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [payment.trackId]);

  useEffect(() => { if (expired) onExpiredRef.current(); }, [expired]);

  const handleCopy = () => {
    navigator.clipboard.writeText(payment.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPaid = status === 'Paid';

  if (isPaid) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <IoCheckmarkCircleOutline size={52} className="text-[#0ecb81]" />
        <div>
          <p className="font-bold text-[#0ecb81] text-base">Payment Confirmed!</p>
          <p className="text-[#848e9c] text-sm mt-1">
            {payment.payAmount} {payment.payCurrency} has been credited to your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Amount + expiry header */}
      <div className="flex items-center justify-between bg-[#2b3139] rounded-xl px-4 py-3">
        <div>
          <p className="text-[#848e9c] text-[10px] uppercase font-semibold tracking-wide">Send exactly</p>
          <p className="text-[#eaecef] font-mono font-bold text-lg">
            {payment.payAmount} <span className="text-[#848e9c] text-sm">{payment.payCurrency}</span>
          </p>
          <p className="text-[#848e9c] text-[10px] mt-0.5">{payment.network}</p>
        </div>
        <div className="text-right">
          <p className="text-[#848e9c] text-[10px] uppercase font-semibold tracking-wide">Expires in</p>
          <p className={`font-mono font-bold text-lg ${countdown === '00:00' ? 'text-[#f6465d]' : 'text-[#f0b90b]'}`}>
            {countdown}
          </p>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <IoRefreshOutline size={10} className="animate-spin text-[#f0b90b]" />
            <span className="text-[#848e9c] text-[10px]">{status}</span>
          </div>
        </div>
      </div>

      {/* QR Code — plain address, scannable by any camera or wallet app */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="bg-white rounded-xl p-4">
          <QRCode value={payment.address} size={168} />
        </div>
        <p className="text-[#848e9c] text-[10px]">
          Scan with <span className="text-[#eaecef] font-semibold">Trust Wallet</span> or{' '}
          <span className="text-[#eaecef] font-semibold">MetaMask</span> to send directly
        </p>
      </div>

      {/* Address */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-[#848e9c] font-semibold uppercase tracking-wider">
            {payment.payCurrency} Address
          </span>
          <button onClick={handleCopy}
            className="flex items-center gap-1 text-xs font-semibold text-[#f0b90b] hover:opacity-80">
            {copied
              ? <><IoCheckmarkCircleOutline size={13} /> Copied!</>
              : <><IoCopyOutline size={13} /> Copy</>}
          </button>
        </div>
        <div onClick={handleCopy}
          className="bg-[#2b3139] border border-[#363c45] hover:border-[#f0b90b] rounded-xl px-4 py-3 cursor-pointer transition-colors group">
          <p className="text-[#eaecef] text-xs font-mono break-all group-hover:text-[#f0b90b] transition-colors">
            {payment.address}
          </p>
        </div>
        {payment.memo && (
          <p className="text-[#f0b90b] text-xs mt-1.5 font-semibold">
            ⚠ MEMO required: <span className="font-mono">{payment.memo}</span>
          </p>
        )}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-xl px-3 py-2.5">
        <LuTriangleAlert size={14} className="text-[#f0b90b] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[#848e9c] leading-relaxed">
          Only send <span className="text-[#eaecef] font-bold">{payment.payCurrency}</span> on the{' '}
          <span className="text-[#eaecef] font-bold">{payment.network}</span> network.
          Sending the wrong coin or network will result in{' '}
          <span className="text-[#f6465d] font-semibold">permanent loss of funds</span>.
          Your balance updates automatically after confirmation.
        </p>
      </div>

      <button onClick={onBack}
        className="text-[#848e9c] text-xs hover:text-[#eaecef] underline underline-offset-2 text-center transition-colors">
        ← Start a new deposit
      </button>
    </div>
  );
};

// ── Main modal ─────────────────────────────────────────────────────────────
const DepositModal = ({ open, onClose, onSuccess }) => {
  const [coin,    setCoin]    = useState('USDT');
  const [network, setNetwork] = useState('TRX');
  const [amount,  setAmount]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [payment, setPayment] = useState(null); // white-label response

  const coinMeta = COINS.find(c => c.symbol === coin);
  const networks = coinMeta?.networks ?? [];

  const handleCoinChange = (symbol) => {
    setCoin(symbol);
    setNetwork(COINS.find(c => c.symbol === symbol)?.networks[0] ?? 'TRX');
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.post(
        '/api/payment/whitelabel',
        { currency: coin, network, amount: amt }
      );
      setPayment(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPayment(null);
    setError(null);
    setAmount('');
    onClose();
  };

  const handlePaid = useCallback((data) => {
    onSuccess && onSuccess(coin, data?.payAmount ?? amount);
    setTimeout(handleClose, 3000);
  }, [coin, amount]); // eslint-disable-line

  const handleExpired = useCallback(() => {
    setPayment(null);
    setError('Payment expired. Please create a new deposit.');
  }, []);

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
            <h2 className="font-bold text-[#eaecef] text-base">
              {payment ? 'Send Payment' : 'Deposit Crypto'}
            </h2>
          </div>
          <button onClick={handleClose}
            className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139] transition-colors">
            <IoCloseOutline size={20} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">

          {payment ? (
            <PaymentScreen
              payment={payment}
              onPaid={handlePaid}
              onExpired={handleExpired}
              onBack={() => setPayment(null)}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              {/* Coin */}
              <div>
                <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
                  Select Coin
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {COINS.map(({ symbol, color }) => (
                    <CoinBtn key={symbol} symbol={symbol} color={color}
                      selected={coin === symbol} onClick={() => handleCoinChange(symbol)} />
                  ))}
                </div>
              </div>

              {/* Network */}
              {networks.length > 1 && (
                <div>
                  <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
                    Network
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {networks.map(net => (
                      <button key={net} type="button" onClick={() => setNetwork(net)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          network === net
                            ? 'border-[#f0b90b] bg-[#f0b90b]/10 text-[#f0b90b]'
                            : 'border-[#363c45] bg-[#2b3139] text-[#848e9c] hover:border-[#848e9c] hover:text-[#eaecef]'
                        }`}>
                        {NETWORK_LABELS[net] ?? net}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount (in USD) */}
              <div>
                <label className="block text-xs text-[#848e9c] font-semibold uppercase tracking-wider mb-2">
                  Amount (USD)
                </label>
                <div className="bg-[#2b3139] border border-[#363c45] focus-within:border-[#f0b90b] rounded-xl flex items-center px-4 py-3 transition-colors mb-2.5">
                  <span className="text-[#848e9c] text-sm font-bold pr-3 shrink-0">$</span>
                  <input type="number" required min="1" step="any" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    className="bg-transparent text-[#eaecef] text-base w-full outline-none font-mono placeholder-[#848e9c]" />
                  <span className="text-[#848e9c] text-sm font-bold pl-3 shrink-0">USD</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map(amt => (
                    <button key={amt} type="button" onClick={() => setAmount(String(amt))}
                      className="py-1.5 text-xs font-semibold text-[#848e9c] border border-[#363c45] rounded-lg bg-[#2b3139] hover:border-[#f0b90b] hover:text-[#f0b90b] transition-colors">
                      ${amt}
                    </button>
                  ))}
                </div>
                <p className="text-[#848e9c] text-[10px] mt-2">
                  The exact {coin} amount will be calculated at the live rate.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#f6465d]/10 border border-[#f6465d]/20 text-[#f6465d] text-sm">
                  <IoAlertCircleOutline size={17} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit"
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className="w-full py-3 font-bold rounded-xl transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-[#f0b90b] hover:bg-[#d4a300] text-black">
                {loading ? 'Generating address…' : `Get ${coin} Deposit Address`}
              </button>

            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default DepositModal;
