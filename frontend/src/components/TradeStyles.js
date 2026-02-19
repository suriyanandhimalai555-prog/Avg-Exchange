// frontend/src/components/TradeStyles.js

export const tradeStyles = {
  section: "w-full min-h-screen pt-24 pb-20 bg-[#0b0c0e] text-white relative overflow-hidden",
  container: "max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col lg:flex-row gap-6",
  
  // Left Side (OrderForm)
  formSection: "w-full lg:w-1/3 bg-[#181a20] rounded-2xl border border-white/[0.05] p-6 h-fit shadow-xl",
  header: "flex justify-between items-center mb-6",
  title: "text-2xl font-bold text-white",
  
  inputGroup: "mb-6",
  label: "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2",
  inputWrapper: "relative",
  input: "w-full bg-[#0b0c0e] border border-white/[0.1] rounded-xl py-4 pl-4 pr-16 text-white text-lg font-mono focus:outline-none focus:border-[#00D68F]/50 transition-all",
  currency: "absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm",
  
  walletBtn: "w-full py-4 rounded-xl font-bold text-black bg-[#00D68F] hover:bg-[#00bd7e] transition-all mb-4 flex items-center justify-center gap-2",
  submitBtn: "w-full py-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
  
  // Right Side (OrderBook)
  bookSection: "w-full lg:w-2/3 bg-[#181a20] rounded-2xl border border-white/[0.05] p-6 min-h-[600px] shadow-xl",
  bookHeader: "text-xl font-bold text-white mb-6 flex items-center gap-2",
  
  tableWrapper: "overflow-x-auto",
  table: "w-full",
  thead: "border-b border-white/[0.05]",
  th: "text-left py-4 text-xs font-bold text-gray-500 uppercase tracking-wider",
  tbody: "divide-y divide-white/[0.05]",
  tr: "hover:bg-white/[0.02] transition-colors",
  td: "py-3 text-sm font-mono text-gray-300",
  
  // Text Colors
  green: "text-[#00D68F]",
  red: "text-[#ff4d4f]",
  
  // Loading/Empty
  centerState: "flex flex-col items-center justify-center h-64 text-gray-500",
  
  // Background
  glow: "absolute top-0 right-0 w-[500px] h-[500px] bg-[#00D68F]/5 rounded-full blur-[128px] pointer-events-none",
};