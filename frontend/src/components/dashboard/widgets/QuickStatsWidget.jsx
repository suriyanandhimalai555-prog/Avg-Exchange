// frontend/src/components/dashboard/widgets/QuickStatsWidget.jsx
// Four-cell stats overview card.
// Props:
//   openOrderCount  {number}
//   totalTradeCount {number}
//   totalVolumeUSD  {number}
//   kycLevel        {string}  — 'Basic' | 'Verified'
import React from 'react';
import { LuPackage, LuRepeat2, LuActivity, LuBadgeCheck } from 'react-icons/lu';

const StatCard = ({ icon: Icon, label, value, sub, ringColor, bgColor, textColor }) => (
  <div className="flex items-start gap-3 p-3.5 bg-[#181b22] rounded-xl border border-[#2b3139] group hover:border-[#363c45] transition-colors">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
      <Icon size={17} className={textColor} />
    </div>
    <div className="min-w-0">
      <p className="text-[11px] text-[#848e9c] font-medium leading-none mb-1">{label}</p>
      <p className="text-base font-bold text-[#eaecef] font-mono leading-none">{value}</p>
      {sub && <p className="text-[10px] text-[#848e9c] mt-1 leading-none">{sub}</p>}
    </div>
  </div>
);

const QuickStatsWidget = ({ openOrderCount, totalTradeCount, totalVolumeUSD, kycLevel }) => {
  const vol = totalVolumeUSD ?? 0;
  const fmtVol = vol >= 1_000_000
    ? '$' + (vol / 1_000_000).toFixed(2) + 'M'
    : vol >= 1_000
    ? '$' + (vol / 1_000).toFixed(1) + 'K'
    : '$' + vol.toFixed(2);

  return (
    <div className="bg-[#1e2329] border border-[#2b3139] rounded-xl p-5 flex flex-col gap-4 h-full">
      <span className="text-xs font-semibold text-[#848e9c] uppercase tracking-widest">
        Account Overview
      </span>

      <div className="grid grid-cols-2 gap-3 flex-1">
        <StatCard
          icon={LuPackage}
          label="Open Orders"
          value={openOrderCount ?? 0}
          sub={openOrderCount === 1 ? 'pending fill' : 'pending fills'}
          bgColor="bg-[#f0b90b]/10"
          textColor="text-[#f0b90b]"
        />
        <StatCard
          icon={LuRepeat2}
          label="Total Trades"
          value={totalTradeCount ?? 0}
          sub="all time"
          bgColor="bg-[#0ecb81]/10"
          textColor="text-[#0ecb81]"
        />
        <StatCard
          icon={LuActivity}
          label="24h Volume"
          value={fmtVol}
          sub="personal"
          bgColor="bg-[#627eea]/10"
          textColor="text-[#627eea]"
        />
        <StatCard
          icon={LuBadgeCheck}
          label="Account Level"
          value={kycLevel ?? 'Basic'}
          sub="KYC status"
          bgColor={kycLevel === 'Verified' ? 'bg-[#0ecb81]/10' : 'bg-[#9945ff]/10'}
          textColor={kycLevel === 'Verified' ? 'text-[#0ecb81]' : 'text-[#9945ff]'}
        />
      </div>
    </div>
  );
};

export default QuickStatsWidget;
