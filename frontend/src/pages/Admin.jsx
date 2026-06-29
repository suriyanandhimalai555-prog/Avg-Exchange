// frontend/src/pages/Admin.jsx
//
// Architecture: each section (StatsBar, KYC table, Users table, Orders table)
// is its own component with its own state + socket listener.
// Updating stats never re-renders tables, updating orders never re-renders stats, etc.

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { io } from 'socket.io-client';
import { useSelector } from 'react-redux';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import client, { API_URL } from '../api/client';
import { adminApi } from '../api';
import { ADMIN_REFRESH } from '../constants/socket';
import {
  LuUsers, LuPackage, LuRepeat2, LuShieldCheck,
  LuCircleCheck, LuCircleX, LuTriangleAlert,
  LuFileText, LuChevronLeft, LuChevronRight, LuArrowRight,
} from 'react-icons/lu';
import ReferralsTab from '../components/admin/ReferralsTab';

const TABS = ['Overview', 'KYC', 'Users', 'Orders', 'Referrals', 'Static Coin'];
const ORDERS_LIMIT = 50;

// ── Shared UI primitives ─────────────────────────────────────
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

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtVol  = (v) => v >= 1e9 ? `$${(v/1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${(v||0).toFixed(0)}`;

// Shared throttled socket hook — returns a stable "subscribe to admin:refresh" function.
// Each component calls this independently so they each get their own throttle timer.
const useAdminSocket = (callback, throttleMs = 3000) => {
  const cbRef      = useRef(callback);
  const lastFired  = useRef(0);
  cbRef.current = callback;

  useEffect(() => {
    const socket = io(API_URL, { withCredentials: true });
    socket.on(ADMIN_REFRESH, () => {
      const now = Date.now();
      if (now - lastFired.current < throttleMs) return;
      lastFired.current = now;
      cbRef.current();
    });
    return () => socket.disconnect();
  }, [throttleMs]);
};

// ── STATS BAR ────────────────────────────────────────────────
// Self-contained: owns its own state, fetch, and socket listener.
// Never causes tables to re-render.
const StatCard = memo(({ icon: Icon, label, value, color }) => (
  <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={22} className="text-white" />
    </div>
    <div>
      <p className="text-[#848e9c] text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-[#eaecef] font-mono mt-0.5">{value}</p>
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

const StatsBar = memo(({ onStatsChange }) => {
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/stats');
      setStats(data);
      if (onStatsChange) onStatsChange(data);
    } catch (_) {}
  }, [onStatsChange]);

  // Initial load
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Live updates — independent socket, independent throttle
  useAdminSocket(fetchStats, 4000);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard icon={LuUsers}       label="Total Users"  value={stats.totalUsers}   color="bg-[#627eea]" />
      <StatCard icon={LuPackage}     label="Open Orders"  value={stats.openOrders}   color="bg-[#f0b90b]" />
      <StatCard icon={LuRepeat2}     label="Total Trades" value={stats.totalTrades}  color="bg-[#0ecb81]" />
      <StatCard icon={LuShieldCheck} label="Pending KYC"  value={stats.pendingKyc}   color={stats.pendingKyc > 0 ? 'bg-[#f6465d]' : 'bg-[#848e9c]'} />
      <StatCard icon={LuRepeat2}     label="Total Volume" value={fmtVol(stats.totalVolumeUSD)} color="bg-[#9945ff]" />
    </div>
  );
});
StatsBar.displayName = 'StatsBar';

// ── OVERVIEW TAB ─────────────────────────────────────────────
const OverviewTab = memo(() => {
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await client.get('/api/admin/stats');
      setStats(data);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useAdminSocket(fetchStats, 5000);

  return (
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
  );
});
OverviewTab.displayName = 'OverviewTab';

// ── KYC TAB ──────────────────────────────────────────────────
const KycTab = memo(() => {
  const [kyc, setKyc]             = useState([]);
  const [error, setError]         = useState(false);
  const [loading, setLoading]     = useState(false);
  const [feedback, setFeedback]   = useState(null);
  const [rejectNote, setRejectNote]     = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);

  const flash = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const fetchKyc = useCallback(async () => {
    setError(false);
    try {
      const { data } = await client.get('/api/admin/kyc');
      setKyc(data);
    } catch (_) { setError(true); }
  }, []);

  useEffect(() => { fetchKyc(); }, [fetchKyc]);
  useAdminSocket(fetchKyc, 5000);

  const handleApprove = async (userId) => {
    setLoading(true);
    try {
      await client.post(`/api/admin/kyc/${userId}/approve`);
      flash('KYC approved');
      fetchKyc();
    } catch { flash('Failed to approve', 'error'); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setLoading(true);
    try {
      await client.post(`/api/admin/kyc/${rejectTarget}/reject`, { note: rejectNote });
      flash('KYC rejected');
      setRejectTarget(null); setRejectNote('');
      fetchKyc();
    } catch { flash('Failed to reject', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      {feedback && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${feedback.type === 'error' ? 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'}`}>
          {feedback.msg}
        </div>
      )}

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
            {error
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
  );
});
KycTab.displayName = 'KycTab';

// ── USERS TAB ────────────────────────────────────────────────
const UsersTab = memo(() => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    setError(false);
    try {
      const { data } = await client.get('/api/admin/users');
      setUsers(data);
    } catch (_) { setError(true); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useAdminSocket(fetchUsers, 8000);

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2b3139]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1e2329] text-[#848e9c] text-[11px] uppercase tracking-wide">
            <th className="px-4 py-3 text-left">User</th>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">KYC</th>
            <th className="px-4 py-3 text-left">Role</th>
            <th className="px-4 py-3 text-left">Joined</th>
            <th className="px-4 py-3 text-right">View</th>
          </tr>
        </thead>
        <tbody>
          {error
            ? <ErrorRow cols={6} />
            : users.length === 0
              ? <EmptyRow cols={6} msg="No users found" />
              : users.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="border-t border-[#2b3139] hover:bg-[#1e2329]/70 cursor-pointer"
                  >
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
                    <td className="px-4 py-3">
                      {u.is_admin
                        ? <span className="text-[#f0b90b] font-bold text-xs">Admin</span>
                        : <span className="text-[#848e9c] text-xs">User</span>}
                    </td>
                    <td className="px-4 py-3 text-[#848e9c] text-xs">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <LuArrowRight size={14} className="text-[#848e9c] group-hover:text-[#eaecef] ml-auto" />
                    </td>
                  </tr>
                ))
          }
        </tbody>
      </table>
    </div>
  );
});
UsersTab.displayName = 'UsersTab';

// ── ORDERS TAB ───────────────────────────────────────────────
const Pagination = ({ page, pages, total, limit, onPage }) => {
  if (pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#2b3139] bg-[#1e2329]">
      <span className="text-[#848e9c] text-xs">
        {from}–{to} of {total.toLocaleString()} orders
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-[#2b3139] text-[#848e9c] hover:text-[#eaecef] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <LuChevronLeft size={15} />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
          .reduce((acc, p, idx, arr) => {
            if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
            acc.push(p);
            return acc;
          }, [])
          .map((p, idx) =>
            p === '…' ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-[#848e9c] text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                  p === page
                    ? 'bg-[#f0b90b] text-black'
                    : 'text-[#848e9c] hover:bg-[#2b3139] hover:text-[#eaecef]'
                }`}
              >
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pages}
          className="p-1.5 rounded-lg hover:bg-[#2b3139] text-[#848e9c] hover:text-[#eaecef] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <LuChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

const OrdersTab = memo(() => {
  const [orders, setOrders]     = useState([]);
  const [meta, setMeta]         = useState({ total: 0, pages: 1 });
  const [page, setPage]         = useState(1);
  const [error, setError]       = useState(false);
  const pageRef = useRef(1);

  const fetchOrders = useCallback(async (p) => {
    const target = p ?? pageRef.current;
    setError(false);
    try {
      const { data } = await client.get(
        `/api/admin/orders?page=${target}&limit=${ORDERS_LIMIT}`
      );
      setOrders(data.orders);
      setMeta({ total: data.total, pages: data.pages });
    } catch (_) { setError(true); }
  }, []);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  // Socket: refresh current page
  useAdminSocket(() => fetchOrders(), 3000);

  const handlePage = (newPage) => {
    setPage(newPage);
    pageRef.current = newPage;
    fetchOrders(newPage);
  };

  return (
    <div className="rounded-xl border border-[#2b3139] overflow-hidden">
      <div className="overflow-x-auto">
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
            {error
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
      <Pagination
        page={page}
        pages={meta.pages}
        total={meta.total}
        limit={ORDERS_LIMIT}
        onPage={handlePage}
      />
    </div>
  );
});
OrdersTab.displayName = 'OrdersTab';

// ── STATIC COIN TAB ──────────────────────────────────────────
const StaticCoinTab = memo(() => {
  const empty = { symbol: '', min_price: '', max_price: '', current_price: '', enabled: true };
  const [form,    setForm]    = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null); // { type: 'success'|'error', text }

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/api/admin/static-coin');
      if (data) {
        setForm({
          symbol:        data.symbol,
          min_price:     data.min_price,
          max_price:     data.max_price,
          current_price: data.current_price,
          enabled:       data.enabled,
        });
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await client.put('/api/admin/static-coin', form);
      setMsg({ type: 'success', text: 'Static coin config saved successfully' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save' });
    }
    setSaving(false);
  };

  const field = (label, key, hint) => (
    <div>
      <label className="block text-[#848e9c] text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        className="w-full bg-[#0b0e11] border border-[#363c45] focus:border-[#f0b90b] rounded px-3 py-2 text-sm text-[#eaecef] font-mono outline-none transition-colors"
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={hint}
      />
    </div>
  );

  if (loading) return <div className="text-[#848e9c] text-sm py-10 text-center">Loading…</div>;

  return (
    <div className="max-w-lg">
      <h2 className="text-sm font-semibold text-[#848e9c] uppercase tracking-widest mb-1">Static Coin Configuration</h2>
      <p className="text-[#848e9c] text-xs mb-6">
        Configure a custom coin with a fixed trading range. The bot will place orders within [min, max] using the current price as the mid point. Changes take effect on the bot's next cycle.
      </p>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded text-sm font-medium ${
          msg.type === 'success'
            ? 'bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/20'
            : 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/20'
        }`}>{msg.text}</div>
      )}

      <form onSubmit={handleSave} className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-6 flex flex-col gap-4">
        {field('Coin Symbol', 'symbol', 'e.g. AVG')}

        <div className="grid grid-cols-2 gap-4">
          {field('Min Price (USDT)', 'min_price', 'e.g. 0.50')}
          {field('Max Price (USDT)', 'max_price', 'e.g. 2.00')}
        </div>

        {field('Current Price (USDT)', 'current_price', 'Bot mid price — must be between min and max')}

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.enabled ? 'bg-[#f0b90b]' : 'bg-[#363c45]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-[#eaecef]">{form.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>

        <div className="pt-2 border-t border-[#2b3139]">
          <div className="text-[10px] text-[#848e9c] mb-3 leading-relaxed">
            The bot places <strong className="text-[#eaecef]">buy orders</strong> from current price down to min,
            and <strong className="text-[#eaecef]">sell orders</strong> from current price up to max.
            Orders will never be placed outside this range.
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-[#f0b90b] hover:bg-[#d4a017] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm rounded transition-colors"
          >
            {saving ? 'Saving…' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
});
StaticCoinTab.displayName = 'StaticCoinTab';

// ── MAIN ADMIN SHELL ─────────────────────────────────────────
// Thin shell: only manages tab routing and the live indicator.
// All data lives inside the child components — no cross-section re-renders.
const TAB_FROM_PARAM = {
  overview:    'Overview',
  kyc:         'KYC',
  users:       'Users',
  orders:      'Orders',
  referrals:   'Referrals',
  'static-coin': 'Static Coin',
};

const Admin = () => {
  const user      = useSelector((s) => s.auth.user);
  const navigate  = useNavigate();
  const { tab: tabParam } = useParams();
  const tab = TAB_FROM_PARAM[tabParam] || 'Overview';

  const setTab = (t) => navigate(`/admin/${t.toLowerCase().replace(' ', '-')}`, { replace: true });

  // Live pulse indicator — lightweight, only re-renders the dot
  const [liveIndicator, setLiveIndicator] = useState(false);
  useAdminSocket(() => {
    setLiveIndicator(true);
    setTimeout(() => setLiveIndicator(false), 800);
  }, 500); // very short throttle — just for the visual pulse

  // Pending KYC count for tab badge — pulled from StatsBar via callback
  const [pendingKyc, setPendingKyc] = useState(0);
  const handleStatsChange = useCallback((stats) => {
    setPendingKyc(stats?.pendingKyc ?? 0);
  }, []);

  if (!user?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-[#0b0e11] text-[#eaecef]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#eaecef]">Admin Panel</h1>
            <p className="text-[#848e9c] text-sm mt-0.5">Exchange management dashboard</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${liveIndicator ? 'bg-[#0ecb81]' : 'bg-[#2b3139]'}`} />
            <span className="text-[#848e9c] text-xs">Live</span>
          </div>
        </div>

        {/* Stats — independent component, updates itself */}
        <StatsBar onStatsChange={handleStatsChange} />

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
              {t === 'KYC' && pendingKyc > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#f6465d] text-white text-[9px] font-bold">{pendingKyc}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content — each is a self-contained component */}
        {tab === 'Overview'     && <OverviewTab />}
        {tab === 'KYC'          && <KycTab />}
        {tab === 'Users'        && <UsersTab />}
        {tab === 'Orders'       && <OrdersTab />}
        {tab === 'Referrals'    && <ReferralsTab />}
        {tab === 'Static Coin'  && <StaticCoinTab />}

      </div>
    </div>
  );
};

export default Admin;
