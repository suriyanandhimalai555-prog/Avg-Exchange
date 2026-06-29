/**
 * ReferralTree.jsx — Pure recursive renderer for a referral subtree.
 *
 * Receives a flat list of nodes (each with a `referred_by` parent pointer and a
 * `depth` field as returned by GET /api/admin/referrals/:userId/tree) and
 * renders an indented, collapsible tree.
 *
 * No fetching, no global state — fully presentational so the parent owns data.
 */

import { memo, useMemo, useState, useCallback } from 'react';
import { LuChevronRight, LuChevronDown, LuUserPlus, LuCopy, LuCheck } from 'react-icons/lu';

// ── Helpers ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-[#627eea]', 'bg-[#0ecb81]', 'bg-[#f0b90b]',
  'bg-[#f6465d]', 'bg-[#9945ff]', 'bg-[#14f195]',
];
const pickColor = (s = '?') =>
  AVATAR_COLORS[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_COLORS.length];

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/**
 * Convert a flat array of {id, referred_by, ...} into a nested
 * { ...node, children: [...] } tree. O(n).
 */
const buildTree = (nodes, rootId) => {
  const byId = new Map();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  let root = null;
  for (const node of byId.values()) {
    if (node.id === rootId) {
      root = node;
      continue;
    }
    const parent = byId.get(node.referred_by);
    if (parent) parent.children.push(node);
  }
  return root;
};

// ── Single node row ──────────────────────────────────────────────
const TreeNode = memo(({ node, isRoot, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const hasChildren = node.children.length > 0;
  const label = node.name || node.email || `User #${node.id}`;
  const initial = label.trim()[0]?.toUpperCase() || '?';

  const copyCode = useCallback((e) => {
    e.stopPropagation();
    if (!node.referral_code) return;
    navigator.clipboard?.writeText(node.referral_code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }, [node.referral_code]);

  return (
    <li className="relative">
      <div
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : -1}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={hasChildren ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        } : undefined}
        className={`group flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${
          hasChildren ? 'cursor-pointer hover:bg-[#2b3139]/60' : ''
        } ${isRoot ? 'bg-[#f0b90b]/5 border border-[#f0b90b]/20' : ''}`}
      >
        {/* Chevron / spacer */}
        <span className="w-4 h-4 flex items-center justify-center text-[#848e9c] shrink-0">
          {hasChildren ? (
            expanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />
          ) : null}
        </span>

        {/* Avatar */}
        <div className={`w-7 h-7 rounded-full ${pickColor(label)} flex items-center justify-center shrink-0`}>
          <span className="text-white font-bold text-[11px]">{initial}</span>
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[#eaecef] font-semibold text-xs truncate">{label}</span>
            {isRoot && (
              <span className="text-[9px] uppercase font-bold tracking-wider text-[#f0b90b] bg-[#f0b90b]/10 px-1.5 py-0.5 rounded border border-[#f0b90b]/20">
                root
              </span>
            )}
          </div>
          <div className="text-[#848e9c] text-[10px] truncate">{node.email}</div>
        </div>

        {/* Referral code with copy */}
        {node.referral_code && (
          <button
            onClick={copyCode}
            className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[#2b3139] hover:bg-[#363c45] text-[#848e9c] hover:text-[#eaecef] text-[10px] font-mono shrink-0 transition-colors"
            title="Copy referral code"
          >
            {copied ? <LuCheck size={10} className="text-[#0ecb81]" /> : <LuCopy size={10} />}
            <span>{node.referral_code}</span>
          </button>
        )}

        {/* Direct count chip */}
        <div className="flex items-center gap-1 text-[#848e9c] text-[10px] shrink-0 px-2 py-0.5 rounded bg-[#2b3139]/60">
          <LuUserPlus size={10} />
          <span className="font-mono">{node.direct_count}</span>
        </div>

        {/* Joined date */}
        <span className="hidden md:inline text-[#848e9c] text-[10px] shrink-0 w-24 text-right">
          {fmtDate(node.created_at)}
        </span>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul className="pl-5 border-l border-dashed border-[#2b3139] ml-3 mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} isRoot={false} defaultExpanded={false} />
          ))}
        </ul>
      )}
    </li>
  );
});
TreeNode.displayName = 'TreeNode';

// ── Top-level tree component ─────────────────────────────────────
const ReferralTree = memo(({ nodes, rootId }) => {
  const root = useMemo(() => buildTree(nodes || [], rootId), [nodes, rootId]);

  if (!root) {
    return (
      <div className="text-[#848e9c] text-sm py-8 text-center">
        Selected user not found in tree response.
      </div>
    );
  }

  if (root.children.length === 0) {
    return (
      <div className="border border-dashed border-[#2b3139] rounded-lg p-8 text-center">
        <div className="text-[#eaecef] text-sm font-semibold mb-1">{root.name || root.email}</div>
        <div className="text-[#848e9c] text-xs">
          Hasn’t referred anyone yet. Their referral code is <span className="font-mono text-[#eaecef]">{root.referral_code || '—'}</span>.
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5" role="tree" aria-label="Referral tree">
      <TreeNode node={root} isRoot defaultExpanded />
    </ul>
  );
});
ReferralTree.displayName = 'ReferralTree';

export default ReferralTree;
