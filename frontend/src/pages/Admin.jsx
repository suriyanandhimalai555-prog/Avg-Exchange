// frontend/src/pages/Admin.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import API_URL from '../config/api';
import {
  LuUsers, LuPackage, LuRepeat2, LuShieldCheck,
  LuCircleCheck, LuCircleX, LuRefreshCw, LuTriangleAlert,
  LuFileText, LuShield, LuShieldOff, LuCirclePlus,
} from 'react-icons/lu';

const TABS = ['Overview', 'KYC', 'Users', 'Orders'];

// ── Avatar: coloured circle with initials ──────────────────────
const AVATAR_COLORS = [
  'bg-[#627eea]', 'bg-[#0ecb81]', 'bg-[#f0b90b]',
  'bg-[#f6465d]', 'bg-[#9945ff]', 'bg-[#14f195]',
];
const Avatar = ({ name, email, size = 8 }) => {
  const label  = (name || email || '?').trim();
  const letter = label[0].toUpperCase();
  const color  = AVATAR_COLORS[(label.charCodeAt(0) + (label.charCodeAt(1) || 0)) % AVATAR_COLORS.length];
  return (
    <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center shrink-0`}>
      <span className="text-white font-bold text-xs">{letter}</span>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div>
      <p className="text-[#848e9c] text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-[#eaecef] font-mono mt-0.5">{value}</p>
    </div>
  </div>
);

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

const EmptyRow = ({ cols, msg }) => (
  <tr><td colSpan={cols} className="px-4 py-10 text-center text-[#848e9c] text-sm">{msg}</td></tr>
);

const ErrorRow = ({ cols }) => (
  <tr>
    <td colSpan={cols} className="px-4 py-10 text-center">
      <div className="flex items-center justify-center gap-2 text-[#f6465d] text-sm">
        <LuTriangleAlert size={16} />
        <span>Failed to load data. Check the console or try refreshing.</span>
      </div>
    </td>
  </tr>
);

// ── Add-balance modal ─────────────────────────────────────────
const AddBalanceModal = ({ target, onClose, onSuccess }) => {
  const [currency, setCurrency] = useState('USDT');
  const [amount,   setAmount]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/admin/users/${target.id}/add-balance`, { currency, amount }, { withCredentials: true });
      onSuccess();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to add balance');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
        <h3 className="font-bold text-[#eaecef]">Add Balance — {target.name || target.email}</h3>
        {err && <p className="text-[#f6465d] text-sm">{err}</p>}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="bg-[#2b3139] border border-[#363c45] rounded-lg px-3 py-2 text-sm text-[#eaecef] outline-none focus:border-[#f0b90b]"
          >
            {['USDT','BTC','ETH','BNB','SOL'].map(c => <option key={c} value={c}>{c}</option>)}
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

// ─────────────────────────────────────────────────────────────
const Admin = () => {
  const user = useSelector((s) => s.auth.user);
  const [tab,    setTab]    = useState('Overview');
  const [stats,  setStats]  = useState(null);
  const [kyc,    setKyc]    = useState([]);
  const [users,  setUsers]  = useState([]);
  const [orders, setOrders] = useState([]);

  const [kycError,    setKycError]    = useState(false);
  const [usersError,  setUsersError]  = useState(false);
  const [ordersError, setOrdersError] = useState(false);

  const [loading,      setLoading]      = useState(false);
  const [feedback,     setFeedback]     = useState(null);
  const [rejectNote,   setRejectNote]   = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [balanceTarget, setBalanceTarget] = useState(null);

  if (!user?.isAdmin) return <Navigate to="/" replace />;

  const flash = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/stats`, { withCredentials: true });
      setStats(data);
    } catch (_) {}
  }, []);

  const fetchKyc = useCallback(async () => {
    setKycError(false);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/kyc`, { withCredentials: true });
      setKyc(data);
    } catch (_) { setKycError(true); }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersError(false);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/users`, { withCredentials: true });
      setUsers(data);
    } catch (_) { setUsersError(true); }
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersError(false);
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/orders`, { withCredentials: true });
      setOrders(data);
    } catch (_) { setOrdersError(true); }
  }, []);

  useEffect(() => {
    fetchStats();
    if (tab === 'KYC')    fetchKyc();
    if (tab === 'Users')  fetchUsers();
    if (tab === 'Orders') fetchOrders();
  }, [tab]);

  const handleRefresh = () => {
    fetchStats();
    if (tab === 'KYC')    fetchKyc();
    if (tab === 'Users')  fetchUsers();
    if (tab === 'Orders') fetchOrders();
  };

  const handleApprove = async (userId) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/admin/kyc/${userId}/approve`, {}, { withCredentials: true });
      flash('KYC approved');
      fetchKyc(); fetchStats();
    } catch { flash('Failed to approve', 'error'); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/admin/kyc/${rejectTarget}/reject`, { note: rejectNote }, { withCredentials: true });
      flash('KYC rejected');
      setRejectTarget(null); setRejectNote('');
      fetchKyc(); fetchStats();
    } catch { flash('Failed to reject', 'error'); }
    finally { setLoading(false); }
  };

  const handleToggleAdmin = async (u) => {
    if (!window.confirm(`${u.is_admin ? 'Remove admin from' : 'Make admin'}: ${u.name || u.email}?`)) return;
    try {
      await axios.patch(`${API_URL}/api/admin/users/${u.id}/toggle-admin`, {}, { withCredentials: true });
      flash(`Admin status updated for ${u.name || u.email}`);
      fetchUsers();
    } catch (e) { flash(e.response?.data?.error || 'Failed', 'error'); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtVol  = (v) => v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${(v||0).toFixed(0)}`;

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#eaecef]">Admin Panel</h1>
            <p className="text-[#848e9c] text-sm mt-0.5">Exchange management dashboard</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2b3139] hover:bg-[#363c45] text-[#848e9c] hover:text-[#eaecef] text-sm transition-colors"
          >
            <LuRefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Toast */}
        {feedback && (
          <div className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${feedback.type === 'error' ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'}`}>
            {feedback.msg}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard icon={LuUsers}       label="Total Users"  value={stats.totalUsers}   color="bg-[#627eea]" />
            <StatCard icon={LuPackage}     label="Open Orders"  value={stats.openOrders}   color="bg-[#f0b90b]" />
            <StatCard icon={LuRepeat2}     label="Total Trades" value={stats.totalTrades}  color="bg-[#0ecb81]" />
            <StatCard icon={LuShieldCheck} label="Pending KYC"  value={stats.pendingKyc}   color={stats.pendingKyc > 0 ? 'bg-[#f6465d]' : 'bg-[#848e9c]'} />
            <StatCard icon={LuRepeat2}     label="Total Volume" value={fmtVol(stats.totalVolumeUSD)} color="bg-[#9945ff]" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#2b3139] gap-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                tab === t ? 'text-[#eaecef] border-[#f0b90b]' : 'text-[#848e9c] border-transparent hover:text-[#eaecef]'
              }`}
            >
              {t}
              {t === 'KYC' && stats?.pendingKyc > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#f6465d] text-white text-[9px] font-bold">{stats.pendingKyc}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6">
            <h2 className="text-sm font-semibold text-[#848e9c] uppercase tracking-widest mb-4">Exchange Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[#848e9c]">
              <div className="space-y-2">
                <div className="flex justify-between"><span>Total Users</span><span className="text-[#eaecef] font-mono">{stats?.totalUsers ?? '—'}</span></div>
                <div className="flex justify-between"><span>Open Orders</span><span className="text-[#eaecef] font-mono">{stats?.openOrders ?? '—'}</span></div>
                <div className="flex justify-between"><span>Total Trades Executed</span><span className="text-[#eaecef] font-mono">{stats?.totalTrades ?? '—'}</span></div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span>Pending KYC Reviews</span><span className={`font-mono font-bold ${stats?.pendingKyc > 0 ? 'text-[#f0b90b]' : 'text-[#0ecb81]'}`}>{stats?.pendingKyc ?? '—'}</span></div>
                <div className="flex justify-between"><span>Total Volume (USD)</span><span className="text-[#eaecef] font-mono">{fmtVol(stats?.totalVolumeUSD ?? 0)}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ── KYC ── */}
        {tab === 'KYC' && (
          <div className="flex flex-col gap-3">
            {/* Reject modal */}
            {rejectTarget && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6 w-full max-w-md flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-[#f6465d]">
                    <LuTriangleAlert size={18} />
                    <h3 className="font-bold">Reject KYC Submission</h3>
                  </div>
                  <p className="text-[#848e9c] text-sm">Provide a reason (optional). The user will be able to re-submit.</p>
                  <textarea
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    placeholder="Reason for rejection…"
                    rows={3}
                    className="bg-[#2b3139] border border-[#363c45] rounded-lg px-3 py-2 text-sm text-[#eaecef] outline-none focus:border-[#f0b90b] resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setRejectTarget(null); setRejectNote(''); }} className="px-4 py-2 rounded-lg bg-[#2b3139] text-[#eaecef] text-sm font-semibold hover:bg-[#363c45] transition-colors">Cancel</button>
                    <button onClick={handleReject} disabled={loading} className="px-4 py-2 rounded-lg bg-[#f6465d] hover:bg-[#e03d52] text-white text-sm font-bold transition-colors disabled:opacity-50">Reject</button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-[#2b3139]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e2329] text-[#848e9c] text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Full Name</th>
                    <th className="px-4 py-3 text-left">Document</th>
                    <th className="px-4 py-3 text-left">Doc File</th>
                    <th className="px-4 py-3 text-left">Submitted</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {kycError
                    ? <ErrorRow cols={7} />
                    : kyc.length === 0
                      ? <EmptyRow cols={7} msg="No KYC submissions yet" />
                      : kyc.map(k => (
                          <tr key={k.user_id} className="border-t border-[#2b3139] hover:bg-[#1e2329]/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={k.user_name} email={k.email} size={7} />
                                <div>
                                  <div className="text-xs text-[#eaecef] font-semibold">{k.user_name || k.email}</div>
                                  <div className="text-[10px] text-[#848e9c]">{k.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#eaecef]">{k.full_name}</td>
                            <td className="px-4 py-3 text-[#848e9c] text-xs">{k.document_type?.replace('_', ' ')} #{k.document_number}</td>
                            <td className="px-4 py-3">
                              {k.document_path ? (
                                <a
                                  href={`${API_URL}/api/admin/kyc/${k.user_id}/document`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[#627eea] hover:text-[#8fa8f5] text-xs underline underline-offset-2"
                                >
                                  <LuFileText size={12} /> View
                                </a>
                              ) : (
                                <span className="text-[#848e9c] text-xs">No file</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[#848e9c] text-xs">{fmtDate(k.submitted_at)}</td>
                            <td className="px-4 py-3"><Badge status={k.status} /></td>
                            <td className="px-4 py-3 text-right">
                              {k.status === 'pending' ? (
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => handleApprove(k.user_id)}
                                    disabled={loading}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0ecb81]/10 hover:bg-[#0ecb81]/20 text-[#0ecb81] text-xs font-bold border border-[#0ecb81]/20 transition-colors disabled:opacity-50"
                                  >
                                    <LuCircleCheck size={13} /> Approve
                                  </button>
                                  <button
                                    onClick={() => setRejectTarget(k.user_id)}
                                    disabled={loading}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] text-xs font-bold border border-[#f6465d]/20 transition-colors disabled:opacity-50"
                                  >
                                    <LuCircleX size={13} /> Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[#848e9c] text-xs">Reviewed {fmtDate(k.reviewed_at)}</span>
                              )}
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Users ── */}
        {tab === 'Users' && (
          <>
            {balanceTarget && (
              <AddBalanceModal
                target={balanceTarget}
                onClose={() => setBalanceTarget(null)}
                onSuccess={() => { flash(`Balance added for ${balanceTarget.name || balanceTarget.email}`); fetchUsers(); fetchStats(); }}
              />
            )}
            <div className="overflow-x-auto rounded-xl border border-[#2b3139]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1e2329] text-[#848e9c] text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">KYC</th>
                    <th className="px-4 py-3 text-left">USDT Balance</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Joined</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersError
                    ? <ErrorRow cols={7} />
                    : users.length === 0
                      ? <EmptyRow cols={7} msg="No users found" />
                      : users.map(u => (
                          <tr key={u.id} className="border-t border-[#2b3139] hover:bg-[#1e2329]/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar name={u.name} email={u.email} size={8} />
                                <div>
                                  <div className="text-[#eaecef] font-semibold text-xs">{u.name || '—'}</div>
                                  <div className="text-[#848e9c] text-[10px] font-mono">#{u.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#848e9c] text-xs">{u.email}</td>
                            <td className="px-4 py-3"><Badge status={u.kyc_status || 'none'} /></td>
                            <td className="px-4 py-3 text-[#eaecef] font-mono text-xs">${parseFloat(u.total_balance_raw || 0).toFixed(2)}</td>
                            <td className="px-4 py-3">
                              {u.is_admin
                                ? <span className="text-[#f0b90b] font-bold text-xs">Admin</span>
                                : <span className="text-[#848e9c] text-xs">User</span>}
                            </td>
                            <td className="px-4 py-3 text-[#848e9c] text-xs">{fmtDate(u.created_at)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5 justify-end">
                                <button
                                  onClick={() => setBalanceTarget(u)}
                                  title="Add balance"
                                  className="p-1.5 rounded-lg bg-[#0ecb81]/10 hover:bg-[#0ecb81]/20 text-[#0ecb81] border border-[#0ecb81]/20 transition-colors"
                                >
                                  <LuCirclePlus size={13} />
                                </button>
                                <button
                                  onClick={() => handleToggleAdmin(u)}
                                  title={u.is_admin ? 'Remove admin' : 'Make admin'}
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    u.is_admin
                                      ? 'bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] border-[#f6465d]/20'
                                      : 'bg-[#f0b90b]/10 hover:bg-[#f0b90b]/20 text-[#f0b90b] border-[#f0b90b]/20'
                                  }`}
                                >
                                  {u.is_admin ? <LuShieldOff size={13} /> : <LuShield size={13} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Orders ── */}
        {tab === 'Orders' && (
          <div className="overflow-x-auto rounded-xl border border-[#2b3139]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e2329] text-[#848e9c] text-[11px] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Pair</th>
                  <th className="px-4 py-3 text-left">Side</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {ordersError
                  ? <ErrorRow cols={8} />
                  : orders.length === 0
                    ? <EmptyRow cols={8} msg="No orders yet" />
                    : orders.map(o => (
                        <tr key={o.id} className="border-t border-[#2b3139] hover:bg-[#1e2329]/50">
                          <td className="px-4 py-3 text-[#848e9c] text-xs font-mono">#{o.id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Avatar name={o.name} email={o.email} size={6} />
                              <div>
                                <div className="text-[#eaecef] text-xs">{o.name || o.email}</div>
                                <div className="text-[#848e9c] text-[10px]">{o.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#eaecef] font-mono text-xs font-bold">{o.pair}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold ${o.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                              {o.side?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#eaecef] font-mono text-xs">${parseFloat(o.price || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-[#eaecef] font-mono text-xs">{parseFloat(o.quantity).toFixed(4)}</td>
                          <td className="px-4 py-3"><Badge status={o.status} /></td>
                          <td className="px-4 py-3 text-[#848e9c] text-xs">{fmtDate(o.created_at)}</td>
                        </tr>
                      ))
                }
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};

export default Admin;
