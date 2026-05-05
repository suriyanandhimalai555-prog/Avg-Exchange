// frontend/src/components/dashboard/DashSidebar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LuLayoutDashboard, LuChartLine, LuArrowLeftRight,
  LuTrendingUp, LuPercent, LuWallet,
  LuChevronLeft, LuChevronRight, LuSettings,
} from 'react-icons/lu';
import LogoWebp from '../../assets/avg-exchange-logo.webp';

const NAV = [
  { icon: LuLayoutDashboard, label: 'Dashboard', to: '/dashboard' },
  { icon: LuChartLine,       label: 'Markets',   to: '/markets' },
  { icon: LuArrowLeftRight,  label: 'Trade',     to: '/trade' },
  { icon: LuTrendingUp,      label: 'Futures',   soon: true },
  { icon: LuPercent,         label: 'Earn',      soon: true },
  { icon: LuWallet,          label: 'Wallet',    to: '/wallet' },
];

const Tooltip = ({ label }) => (
  <span className="
    absolute left-full ml-3 px-2.5 py-1.5
    bg-[#1e2329] border border-[#363c45] text-[#eaecef]
    text-xs rounded-lg shadow-xl whitespace-nowrap
    opacity-0 pointer-events-none group-hover:opacity-100
    transition-opacity duration-150 z-50
  ">
    {label}
  </span>
);

const DashSidebar = ({ collapsed, onToggle }) => {
  const { pathname } = useLocation();

  return (
    <aside
      style={{ width: collapsed ? 64 : 220 }}
      className="
        relative flex flex-col shrink-0 h-full
        bg-[#0d0e12] border-r border-[#2b3139]
        transition-[width] duration-300 ease-in-out overflow-hidden
      "
    >
      {/* ── Logo ── */}
      <div className="flex items-center h-16 px-4 border-b border-[#2b3139] gap-2.5 overflow-hidden shrink-0">
        <img src={LogoWebp} alt="logo" className="h-7 w-auto shrink-0" />
        {!collapsed && (
          <span className="font-bold text-[#eaecef] text-sm tracking-wide whitespace-nowrap">
            AvgExchange
          </span>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {NAV.map(({ icon: Icon, label, to, soon }) => {
          const active = !soon && pathname === to;
          const rowCls = [
            'flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium',
            'transition-all duration-150 group relative',
            active
              ? 'bg-[#f0b90b]/10 text-[#f0b90b]'
              : 'text-[#848e9c] hover:bg-[#1e2329] hover:text-[#eaecef]',
            soon ? 'opacity-40 pointer-events-none' : '',
          ].join(' ');

          const inner = (
            <>
              <Icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="text-sm whitespace-nowrap flex-1">{label}</span>
              )}
              {!collapsed && soon && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#2b3139] text-[#848e9c]">
                  SOON
                </span>
              )}
              {collapsed && <Tooltip label={soon ? `${label} (Soon)` : label} />}
            </>
          );

          return soon ? (
            <div key={label} className={rowCls}>{inner}</div>
          ) : (
            <Link key={label} to={to} className={rowCls}>{inner}</Link>
          );
        })}
      </nav>

      {/* ── Bottom: Settings + collapse toggle ── */}
      <div className="border-t border-[#2b3139] p-2 flex flex-col gap-0.5 shrink-0">
        <Link
          to="/account"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                     text-[#848e9c] hover:bg-[#1e2329] hover:text-[#eaecef]
                     transition-colors group relative"
        >
          <LuSettings size={18} className="shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Settings</span>}
          {collapsed && <Tooltip label="Settings" />}
        </Link>

        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center py-2 rounded-lg
                     text-[#848e9c] hover:bg-[#1e2329] hover:text-[#eaecef]
                     transition-colors"
        >
          {collapsed ? <LuChevronRight size={17} /> : <LuChevronLeft size={17} />}
        </button>
      </div>
    </aside>
  );
};

export default DashSidebar;
