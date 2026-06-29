// frontend/src/pages/AdminUserDetail.jsx
import { useState, useEffect, useCallback } from 'react';
import client, { API_URL } from '../api/client';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LuArrowLeft, LuShield, LuShieldOff, LuCirclePlus,
  LuTriangleAlert, LuCircleCheck, LuFileText,
} from 'react-icons/lu';

// ── Shared primitives ────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-[#627eea]', 'bg-[#0ecb81]', 'bg-[#f0b90b]',
  'bg-[#f6465d]', 'bg-[#9945ff]', 'bg-[#14f195]',
];
const Avatar = ({ name, email, size = 12 }) => {
  const label  = (name || email || '?').trim();
  const letter = label[0].toUpperCase();
  const color  = AVATAR_COLORS[(label.charCodeAt(0) + (label.charCodeAt(1) || 0)) % AVATAR_COLORS.length];
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold text-lg">{letter}</span>
    </div>
  );
};

const Badge = ({ status }) => {
  const map = {
    approved:         'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
    pending:          'bg-[#f0b90b]/10 text-[#f0b90b] border-[#f0b90b]/20',
    rejected:         'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20',
    none:             'bg-[#848e9c]/10 text-[#848e9c] border-[#848e9c]/20',
    open:             'bg-[#f0b90b]/10 text-[#f0b90b] border-[#f0b90b]/20',
    filled:           'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
    cancelled:        'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20',
    partially_filled: 'bg-[#627eea]/10 text-[#627eea] border-[#627eea]/20',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${map[status] || map.none}`}>
      {status?.replace(/_/g, ' ') || 'none'}
    </span>
  );
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const CURRENCY_ORDER = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA'];

// ── Add Balance Modal ────────────────────────────────────────
const AddBalanceModal = ({ userId, userName, onClose, onSuccess }) => {
  const [currency, setCurrency] = useState('USDT');
  const [amount,   setAmount]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await client.post(`/api/admin/users/${userId}/add-balance`, { currency, amount });
      onSuccess();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to add balance');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="font-bold text-[#eaecef]">Add Balance — {userName}</h3>
        {err && <p className="text-[#f6465d] text-sm">{err}</p>}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="bg-[#2b3139] border border-[#363c45] rounded-lg px-3 py-2 text-sm text-[#eaecef] outline-none focus:border-[#f0b90b]"
          >
            {['USDT','BTC','ETH','BNB','SOL','XRP','DOGE','ADA'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="number" min="0" step="any" required
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="bg-[#2b3139] border border-[#363c45] rounded-lg px-3 py-2 text-sm text-[#eaecef] outline-none focus:border-[#f0b90b]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-[#2b3139] text-[#eaecef] text-sm font-semibold hover:bg-[#363c45] transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-[#f0b90b] hover:bg-[#d4a300] text-black text-sm font-bold transition-colors disabled:opacity-50">
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────
const AdminUserDetail = () => {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(false);
  const [feedback,       setFeedback]       = useState(null);
  const [showAddBalance, setShowAddBalance] = useState(false);

  const flash = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const fetchUser = useCallback(async () => {
    setError(false);
    try {
      const { data } = await client.get(`/api/admin/users/${userId}`);
      setData(data);
    } catch (e) {
      if (e.response?.status === 404) setError('User not found');
      else setError('Failed to load user');
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handleToggleAdmin = async () => {
    const { user } = data;
    if (!window.confirm(`${user.is_admin ? 'Remove admin from' : 'Make admin'}: ${user.name || user.email}?`)) return;
    try {
      await client.patch(`/api/admin/users/${userId}/toggle-admin`);
      flash('Admin status updated');
      fetchUser();
    } catch (e) { flash(e.response?.data?.error || 'Failed', 'error'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="text-[#848e9c] text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#848e9c]">
          <LuTriangleAlert size={28} className="text-[#f6465d]" />
          <p className="text-sm">{error}</p>
          <button onClick={() => navigate('/admin/users')} className="text-[#627eea] hover:underline text-sm">
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  const { user, balances, orders, trades } = data;

  // Sort balances by preferred order
  const sortedBalances = [...balances].sort((a, b) => {
    const ai = CURRENCY_ORDER.indexOf(a.currency);
    const bi = CURRENCY_ORDER.indexOf(b.currency);
    if (ai === -1 && bi === -1) return a.currency.localeCompare(b.currency);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* Back button */}
        <button
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-1.5 text-[#848e9c] hover:text-[#eaecef] text-sm transition-colors w-fit"
        >
          <LuArrowLeft size={15} /> Back to Users
        </button>

        {/* Feedback toast */}
        {feedback && (
          <div className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${feedback.type === 'error' ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'}`}>
            {feedback.msg}
          </div>
        )}

        {/* User header card */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} email={user.email} size={14} />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-[#eaecef]">{user.name || user.email}</h1>
                {user.is_admin && (
                  <span className="px-2 py-0.5 rounded-full bg-[#f0b90b]/10 text-[#f0b90b] border border-[#f0b90b]/20 text-[10px] font-bold uppercase">Admin</span>
                )}
              </div>
              <span className="text-[#848e9c] text-sm">{user.email}</span>
              <div className="flex items-center gap-3 mt-1 text-[#848e9c] text-xs flex-wrap">
                <span>ID #{user.id}</span>
                <span>·</span>
                <span>Joined {fmtDate(user.created_at)}</span>
                {user.referral_code && (
                  <>
                    <span>·</span>
                    <span className="font-mono text-[#627eea]">{user.referral_code}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAddBalance(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0ecb81]/10 hover:bg-[#0ecb81]/20 text-[#0ecb81] text-sm font-bold border border-[#0ecb81]/20 transition-colors"
            >
              <LuCirclePlus size={14} /> Add Balance
            </button>
            <button
              onClick={handleToggleAdmin}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                user.is_admin
                  ? 'bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] border-[#f6465d]/20'
                  : 'bg-[#f0b90b]/10 hover:bg-[#f0b90b]/20 text-[#f0b90b] border-[#f0b90b]/20'
              }`}
            >
              {user.is_admin ? <LuShieldOff size={14} /> : <LuShield size={14} />}
              {user.is_admin ? 'Remove Admin' : 'Make Admin'}
            </button>
          </div>
        </div>

        {/* KYC info */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5">
          <h2 className="text-[11px] font-semibold text-[#848e9c] uppercase tracking-widest mb-4">KYC Status</h2>
          {user.kyc_status ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Status</p>
                <Badge status={user.kyc_status} />
              </div>
              <div>
                <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Full Name</p>
                <p className="text-[#eaecef]">{user.kyc_full_name || '—'}</p>
              </div>
              <div>
                <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Document</p>
                <p className="text-[#eaecef] text-xs">{user.document_type?.replace('_', ' ')} {user.document_number ? `#${user.document_number}` : ''}</p>
              </div>
              <div>
                <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Submitted</p>
                <p className="text-[#eaecef] text-xs">{fmtDateTime(user.kyc_submitted_at)}</p>
              </div>
              <div>
                <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Reviewed</p>
                <p className="text-[#eaecef] text-xs">{fmtDateTime(user.kyc_reviewed_at)}</p>
              </div>
              {user.reviewer_note && (
                <div>
                  <p className="text-[#848e9c] text-[10px] uppercase tracking-wide mb-0.5">Note</p>
                  <p className="text-[#f6465d] text-xs">{user.reviewer_note}</p>
                </div>
              )}
              {user.kyc_status !== 'none' && (
                <div>
                  <a
                    href={`${API_URL}/api/admin/kyc/${user.id}/document`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[#627eea] hover:text-[#8fa8f5] text-xs underline underline-offset-2 mt-4"
                  >
                    <LuFileText size={12} /> View Document
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[#848e9c] text-sm">No KYC submission</p>
          )}
        </div>

        {/* Balances */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5">
          <h2 className="text-[11px] font-semibold text-[#848e9c] uppercase tracking-widest mb-4">Balances</h2>
          {sortedBalances.length === 0 ? (
            <p className="text-[#848e9c] text-sm">No balances</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#848e9c] text-[11px] uppercase tracking-wide border-b border-[#2b3139]">
                    <th className="pb-2 text-left">Currency</th>
                    <th className="pb-2 text-right">Available</th>
                    <th className="pb-2 text-right">Locked</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBalances.map(b => {
                    const avail = parseFloat(b.available);
                    const locked = parseFloat(b.locked);
                    const total = avail + locked;
                    const isUsdt = b.currency === 'USDT';
                    const fmt = (v) => isUsdt
                      ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
                    return (
                      <tr key={b.currency} className="border-t border-[#2b3139]/50">
                        <td className="py-2.5 text-[#eaecef] font-bold font-mono text-xs">{b.currency}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-[#0ecb81]">{fmt(avail)}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-[#f0b90b]">{locked > 0 ? fmt(locked) : <span className="text-[#848e9c]">—</span>}</td>
                        <td className="py-2.5 text-right font-mono text-xs text-[#eaecef] font-semibold">{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2b3139]">
            <h2 className="text-[11px] font-semibold text-[#848e9c] uppercase tracking-widest">Recent Orders</h2>
          </div>
          {orders.length === 0 ? (
            <p className="px-5 py-6 text-[#848e9c] text-sm">No orders</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#848e9c] text-[11px] uppercase tracking-wide bg-[#1e2329]">
                    <th className="px-5 py-3 text-left">ID</th>
                    <th className="px-5 py-3 text-left">Pair</th>
                    <th className="px-5 py-3 text-left">Side</th>
                    <th className="px-5 py-3 text-right">Price</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-t border-[#2b3139] hover:bg-[#2b3139]/30">
                      <td className="px-5 py-3 text-[#848e9c] text-xs font-mono">#{o.id}</td>
                      <td className="px-5 py-3 text-[#eaecef] font-mono text-xs font-bold">{o.pair}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold ${o.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {o.side?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[#eaecef] font-mono text-xs">${parseFloat(o.price || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-[#eaecef] font-mono text-xs">{parseFloat(o.quantity).toFixed(4)}</td>
                      <td className="px-5 py-3"><Badge status={o.status} /></td>
                      <td className="px-5 py-3 text-[#848e9c] text-xs">{fmtDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Trades */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2b3139]">
            <h2 className="text-[11px] font-semibold text-[#848e9c] uppercase tracking-widest">Recent Trades</h2>
          </div>
          {trades.length === 0 ? (
            <p className="px-5 py-6 text-[#848e9c] text-sm">No trades</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#848e9c] text-[11px] uppercase tracking-wide bg-[#1e2329]">
                    <th className="px-5 py-3 text-left">ID</th>
                    <th className="px-5 py-3 text-left">Pair</th>
                    <th className="px-5 py-3 text-left">Side</th>
                    <th className="px-5 py-3 text-right">Price</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} className="border-t border-[#2b3139] hover:bg-[#2b3139]/30">
                      <td className="px-5 py-3 text-[#848e9c] text-xs font-mono">#{t.id}</td>
                      <td className="px-5 py-3 text-[#eaecef] font-mono text-xs font-bold">{t.pair}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold ${t.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {t.side?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[#eaecef] font-mono text-xs">${parseFloat(t.price || 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-[#eaecef] font-mono text-xs">{parseFloat(t.quantity).toFixed(4)}</td>
                      <td className="px-5 py-3 text-[#848e9c] text-xs">{fmtDateTime(t.executed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {showAddBalance && (
        <AddBalanceModal
          userId={user.id}
          userName={user.name || user.email}
          onClose={() => setShowAddBalance(false)}
          onSuccess={() => { flash('Balance added successfully'); fetchUser(); }}
        />
      )}
    </div>
  );
};

export default AdminUserDetail;
