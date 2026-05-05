// frontend/src/components/dashboard/DashTopbar.jsx
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { LuSearch, LuBell, LuPlus, LuChevronDown } from 'react-icons/lu';

const DashTopbar = ({ onDepositClick }) => {
  const user     = useSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);

  const name = user?.name || user?.email || 'User';
  const initials = name.charAt(0).toUpperCase();
  const displayName = name.split('@')[0].slice(0, 16);

  return (
    <header className="
      h-16 bg-[#0d0e12] border-b border-[#2b3139]
      flex items-center px-6 gap-4 shrink-0
    ">
      {/* ── Search ── */}
      <div className={`
        flex items-center gap-2.5 bg-[#1e2329] border rounded-lg px-3 py-2
        transition-colors duration-150 w-56
        ${focused ? 'border-[#f0b90b]/50 shadow-[0_0_0_1px_rgba(240,185,11,0.15)]' : 'border-[#2b3139]'}
      `}>
        <LuSearch size={14} className="text-[#848e9c] shrink-0" />
        <input
          type="text"
          placeholder="Search markets, orders…"
          className="bg-transparent text-sm text-[#eaecef] outline-none placeholder-[#848e9c] w-full"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>

      <div className="flex-1" />

      {/* ── Notification bell ── */}
      <button className="
        relative p-2 rounded-lg
        text-[#848e9c] hover:bg-[#1e2329] hover:text-[#eaecef]
        transition-colors
      ">
        <LuBell size={18} />
      </button>

      {/* ── Deposit CTA ── */}
      <button
        onClick={onDepositClick}
        className="
          flex items-center gap-1.5 px-4 py-2
          bg-[#f0b90b] hover:bg-[#d4a300]
          text-black font-bold text-sm rounded-lg
          transition-colors active:scale-[0.98]
        "
      >
        <LuPlus size={15} />
        Deposit
      </button>

      {/* ── User profile chip ── */}
      <button
        onClick={() => navigate('/account')}
        className="
          flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg
          border border-transparent
          hover:border-[#2b3139] hover:bg-[#1e2329]
          transition-all
        "
      >
        <div className="
          w-8 h-8 rounded-full shrink-0
          bg-gradient-to-br from-[#f0b90b] to-[#d4a300]
          flex items-center justify-center
          text-black font-bold text-sm
        ">
          {initials}
        </div>
        <div className="hidden md:flex flex-col items-start leading-none gap-0.5">
          <span className="text-xs font-semibold text-[#eaecef]">{displayName}</span>
          <span className="text-[10px] text-[#848e9c]">My Account</span>
        </div>
        <LuChevronDown size={13} className="text-[#848e9c] hidden md:block" />
      </button>
    </header>
  );
};

export default DashTopbar;
