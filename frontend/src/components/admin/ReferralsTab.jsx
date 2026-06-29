/**
 * ReferralsTab.jsx — Admin view of referral relationships.
 *
 * Layout: split-pane.
 *   Left  — searchable list of users with direct + total referral counts.
 *   Right — when a user is selected, fetches and renders their subtree
 *           via the decoupled <ReferralTree /> component.
 *
 * Data:
 *   GET /api/admin/referrals?q=&sort=    (list)
 *   GET /api/admin/referrals/:id/tree    (subtree)
 *
 * Decoupled from Admin.jsx: only takes care of its own state, fetching,
 * loading/error UI, and selection. Renders ReferralTree which is pure.
 */

import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LuSearch, LuUsers, LuNetwork, LuTriangleAlert, LuCircleX,
  LuTrendingUp, LuClock, LuChevronRight,
} from 'react-icons/lu';
import { adminApi } from '../../api';
import ReferralTree from './ReferralTree';

// ── Helpers ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-[#627eea]', 'bg-[#0ecb81]', 'bg-[#f0b90b]',
  'bg-[#f6465d]', 'bg-[#9945ff]', 'bg-[#14f195]',
];
const pickColor = (s = '?') =>
  AVATAR_COLORS[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_COLORS.length];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const useDebounced = (value, delay = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
};

// ── Sort selector ────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'direct', label: 'Top direct',  icon: LuTrendingUp },
  { key: 'total',  label: 'Top network', icon: LuNetwork },
  { key: 'recent', label: 'Recent',      icon: LuClock },
];

const SortBar = memo(({ value, onChange }) => (
  <div className="flex gap-1">
    {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
      <button
        key={key}
        onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
          value === key
            ? 'bg-[#f0b90b] text-black'
            : 'bg-[#2b3139] text-[#848e9c] hover:text-[#eaecef]'
        }`}
      >
        <Icon size={11} />
        <span>{label}</span>
      </button>
    ))}
  </div>
));
SortBar.displayName = 'SortBar';

// ── List row ─────────────────────────────────────────────────────
const UserRow = memo(({ user, selected, onSelect }) => {
  const label   = user.name || user.email || `User #${user.id}`;
  const initial = label.trim()[0]?.toUpperCase() || '?';

  return (
    <button
      onClick={() => onSelect(user)}
      aria-selected={selected}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-[#2b3139] transition-colors ${
        selected ? 'bg-[#f0b90b]/10 border-l-2 border-l-[#f0b90b]' : 'hover:bg-[#1e2329]/60 border-l-2 border-l-transparent'
      }`}
    >
      <div className={`w-8 h-8 rounded-full ${pickColor(label)} flex items-center justify-center shrink-0`}>
        <span className="text-white font-bold text-xs">{initial}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[#eaecef] font-semibold text-xs truncate">{label}</div>
        <div className="text-[#848e9c] text-[10px] truncate">{user.email}</div>
        {user.referrer_email && (
          <div className="text-[#848e9c] text-[10px] mt-0.5 flex items-center gap-1 truncate">
            <span className="opacity-60">via</span>
            <span className="text-[#627eea] font-mono">{user.referrer_code || user.referrer_email}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[#0ecb81] font-mono text-xs font-bold">{user.direct_count}</span>
        <span className="text-[#848e9c] text-[9px] uppercase tracking-wider">direct</span>
        {user.total_count > user.direct_count && (
          <span className="text-[#848e9c] font-mono text-[10px]">+{user.total_count - user.direct_count} downstream</span>
        )}
      </div>

      <LuChevronRight size={13} className="text-[#848e9c] shrink-0" />
    </button>
  );
});
UserRow.displayName = 'UserRow';

// ── Right panel header for selected user ─────────────────────────
const SelectedHeader = memo(({ user, treeMeta, onClear }) => {
  const label = user.name || user.email;
  return (
    <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#2b3139]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-[#eaecef] font-bold text-sm truncate">{label}</h3>
          {user.referral_code && (
            <span className="text-[10px] font-mono text-[#f0b90b] bg-[#f0b90b]/10 border border-[#f0b90b]/20 px-1.5 py-0.5 rounded">
              {user.referral_code}
            </span>
          )}
        </div>
        <div className="text-[#848e9c] text-xs">{user.email}</div>
        <div className="flex gap-4 mt-2 text-[10px] text-[#848e9c]">
          <span><span className="text-[#0ecb81] font-mono font-bold">{user.direct_count}</span> direct</span>
          <span><span className="text-[#627eea] font-mono font-bold">{treeMeta?.totalCount ?? user.total_count}</span> total network</span>
          <span><span className="text-[#9945ff] font-mono font-bold">{treeMeta?.maxDepth ?? 0}</span> max depth</span>
          <span>Joined {fmtDate(user.created_at)}</span>
        </div>
      </div>
      <button
        onClick={onClear}
        className="p-1.5 rounded-md hover:bg-[#2b3139] text-[#848e9c] hover:text-[#eaecef] transition-colors shrink-0"
        aria-label="Close detail"
      >
        <LuCircleX size={16} />
      </button>
    </div>
  );
});
SelectedHeader.displayName = 'SelectedHeader';

// ── Main tab ─────────────────────────────────────────────────────
const ReferralsTab = memo(() => {
  // List state
  const [users,      setUsers]      = useState([]);
  const [listError,  setListError]  = useState(false);
  const [listLoading,setListLoading]= useState(true);
  const [query,      setQuery]      = useState('');
  const [sort,       setSort]       = useState('direct');
  const debouncedQ = useDebounced(query, 300);

  // Selection + tree state
  const [selected,    setSelected]    = useState(null);
  const [tree,        setTree]        = useState(null);
  const [treeMeta,    setTreeMeta]    = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError,   setTreeError]   = useState(false);

  // Track in-flight tree request so a fast click sequence doesn't show stale data
  const reqIdRef = useRef(0);

  // ── Fetch list ──────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setListError(false);
    setListLoading(true);
    try {
      const { data } = await adminApi.getReferrals({ q: debouncedQ || undefined, sort });
      setUsers(data || []);
    } catch (_) {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, [debouncedQ, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // ── Fetch tree on selection ─────────────────────────────────
  useEffect(() => {
    if (!selected) {
      setTree(null);
      setTreeMeta(null);
      setTreeError(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setTreeLoading(true);
    setTreeError(false);
    adminApi.getReferralTree(selected.id)
      .then(({ data }) => {
        if (reqIdRef.current !== myReq) return; // stale
        setTree(data.nodes || []);
        setTreeMeta({ totalCount: data.totalCount, maxDepth: data.maxDepth });
      })
      .catch(() => {
        if (reqIdRef.current !== myReq) return;
        setTreeError(true);
      })
      .finally(() => {
        if (reqIdRef.current === myReq) setTreeLoading(false);
      });
  }, [selected]);

  // ── Memoized aggregates for the header ──────────────────────
  const totals = useMemo(() => {
    const referredUsers = users.filter((u) => u.direct_count > 0);
    const sumDirect = referredUsers.reduce((acc, u) => acc + Number(u.direct_count || 0), 0);
    return {
      referrers:   referredUsers.length,
      relations:   sumDirect,
      totalUsers:  users.length,
    };
  }, [users]);

  return (
    <div className="flex flex-col gap-3">
      {/* Top stats row */}
      <div className="grid grid-cols-3 gap-3">
        <StatChip label="Users in system"    value={totals.totalUsers} icon={LuUsers}    color="text-[#627eea]" />
        <StatChip label="Active referrers"   value={totals.referrers}  icon={LuTrendingUp} color="text-[#0ecb81]" />
        <StatChip label="Total relationships" value={totals.relations}  icon={LuNetwork}  color="text-[#9945ff]" />
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
        {/* ── LEFT: list ───────────────────────────────────────── */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl overflow-hidden flex flex-col min-h-[480px]">
          <div className="p-3 border-b border-[#2b3139] flex flex-col gap-2">
            <div className="relative">
              <LuSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848e9c]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, or referral code…"
                className="w-full pl-9 pr-3 py-2 bg-[#0b0e11] border border-[#363c45] focus:border-[#f0b90b] rounded-lg text-xs text-[#eaecef] placeholder:text-[#848e9c] outline-none transition-colors"
              />
            </div>
            <SortBar value={sort} onChange={setSort} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <ListSkeleton />
            ) : listError ? (
              <ListError onRetry={fetchList} />
            ) : users.length === 0 ? (
              <div className="px-4 py-10 text-center text-[#848e9c] text-xs">
                No users match your search.
              </div>
            ) : (
              users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  selected={selected?.id === u.id}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: tree detail ──────────────────────────────── */}
        <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-4 min-h-[480px] flex flex-col">
          {!selected ? (
            <EmptyDetail />
          ) : (
            <>
              <SelectedHeader user={selected} treeMeta={treeMeta} onClear={() => setSelected(null)} />
              <div className="flex-1 overflow-y-auto pt-3">
                {treeLoading ? (
                  <TreeSkeleton />
                ) : treeError ? (
                  <div className="text-[#f6465d] text-sm py-8 text-center flex items-center justify-center gap-2">
                    <LuTriangleAlert size={16} /> Failed to load the referral tree.
                  </div>
                ) : (
                  <ReferralTree nodes={tree || []} rootId={selected.id} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
ReferralsTab.displayName = 'ReferralsTab';

// ── Small presentational pieces ──────────────────────────────────
const StatChip = memo(({ label, value, icon: Icon, color }) => (
  <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl px-4 py-3 flex items-center gap-3">
    <div className={`w-9 h-9 rounded-lg bg-[#0b0e11] flex items-center justify-center ${color}`}>
      <Icon size={16} />
    </div>
    <div>
      <div className="text-[#848e9c] text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-[#eaecef] font-mono font-bold text-lg leading-tight">{value.toLocaleString()}</div>
    </div>
  </div>
));
StatChip.displayName = 'StatChip';

const EmptyDetail = () => (
  <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
    <div className="w-12 h-12 rounded-full bg-[#2b3139] flex items-center justify-center mb-3">
      <LuNetwork size={20} className="text-[#848e9c]" />
    </div>
    <h3 className="text-[#eaecef] text-sm font-semibold mb-1">Select a user to see their referral tree</h3>
    <p className="text-[#848e9c] text-xs max-w-xs">
      Each branch represents who that user brought in, and who those users brought in, all the way down.
    </p>
  </div>
);

const ListSkeleton = () => (
  <div className="px-3 py-3 space-y-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-2.5 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-[#2b3139]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-[#2b3139] rounded w-3/4" />
          <div className="h-2 bg-[#2b3139] rounded w-1/2" />
        </div>
        <div className="w-8 h-3 bg-[#2b3139] rounded" />
      </div>
    ))}
  </div>
);

const TreeSkeleton = () => (
  <div className="space-y-2 pt-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 animate-pulse" style={{ marginLeft: `${(i % 3) * 20}px` }}>
        <div className="w-4" />
        <div className="w-7 h-7 rounded-full bg-[#2b3139]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-[#2b3139] rounded w-2/3" />
          <div className="h-2 bg-[#2b3139] rounded w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

const ListError = ({ onRetry }) => (
  <div className="px-4 py-8 text-center">
    <div className="flex items-center justify-center gap-2 text-[#f6465d] text-sm mb-2">
      <LuTriangleAlert size={16} /> Failed to load referrals
    </div>
    <button
      onClick={onRetry}
      className="text-[#627eea] text-xs underline underline-offset-2 hover:text-[#8fa8f5]"
    >
      Try again
    </button>
  </div>
);

export default ReferralsTab;
