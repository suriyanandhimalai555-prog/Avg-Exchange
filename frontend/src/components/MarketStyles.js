// frontend/src/components/MarketStyles.js

export const marketStyles = {
  section: "w-full min-h-screen pt-6 pb-20 bg-[#0b0c0e] text-white relative overflow-hidden",
  container: "max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10",
  
  // Header
  header: "mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4",
  titleWrapper: "flex items-center gap-4",
  iconBox: "w-12 h-12 rounded-xl bg-[#00D68F]/10 flex items-center justify-center text-[#00D68F] text-2xl",
  title: "text-2xl md:text-3xl font-black text-white",
  subtitle: "text-gray-400 text-sm max-w-xl mt-2",

  // Stats Bar (New)
  statsBar: "grid grid-cols-2 md:grid-cols-4 gap-4 mb-8",
  statItem: "bg-[#181a20] border border-white/[0.05] rounded-xl p-4 flex flex-col",
  statLabel: "text-xs text-gray-500 uppercase font-bold tracking-wider mb-1",
  statValue: "text-lg md:text-xl font-mono font-bold text-white",

  // Controls Bar (Search & Filter)
  controlsBar: "flex flex-col md:flex-row gap-4 mb-6",
  searchWrapper: "relative flex-1",
  searchIcon: "absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg",
  searchInput: "w-full bg-[#181a20] border border-white/[0.05] rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#00D68F]/50 transition-all",
  
  filterGroup: "flex items-center gap-2 overflow-x-auto pb-2 md:pb-0",
  filterBtn: "px-4 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all border",
  filterBtnActive: "bg-[#00D68F]/10 border-[#00D68F] text-[#00D68F]",
  filterBtnInactive: "bg-[#181a20] border-white/[0.05] text-gray-400 hover:text-white hover:bg-white/[0.05]",

  // Table Container
  tableWrapper: "hidden md:block w-full overflow-hidden bg-[#181a20] rounded-2xl border border-white/[0.05] shadow-xl",
  table: "w-full border-collapse",
  
  // Table Head
  thead: "bg-[#0b0c0e]/50 border-b border-white/[0.05]",
  th: "px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap",
  
  // Table Body
  tbody: "divide-y divide-white/[0.05]",
  tr: "hover:bg-white/[0.02] transition-colors duration-150 group",
  td: "px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-200",
  
  // Columns
  rank: "text-gray-600 font-mono w-8 text-center",
  coinInfo: "flex items-center gap-3",
  coinIcon: "w-8 h-8 rounded-full",
  coinText: "flex flex-col",
  symbol: "text-gray-500 text-xs font-bold",
  name: "font-bold text-white group-hover:text-[#00D68F] transition-colors",
  price: "font-mono font-bold text-white tracking-wide",
  
  changeWrapper: "flex items-center gap-1 font-bold text-xs bg-opacity-10 px-2 py-1 rounded-md w-fit",
  changeIcon: "text-[10px]",
  positive: "text-[#00D68F] bg-[#00D68F]/10",
  negative: "text-[#ff4d4f] bg-[#ff4d4f]/10",
  neutral: "text-gray-400 bg-gray-400/10",

  marketCap: "text-gray-400 font-mono text-xs",
  volume: "text-gray-400 font-mono text-xs",
  supply: "text-gray-500 font-mono text-xs",
  supplySymbol: "ml-1 text-gray-600",

  // Mobile Card View (New)
  mobileContainer: "md:hidden flex flex-col gap-3",
  mobileCard: "bg-[#181a20] border border-white/[0.05] rounded-xl p-4 active:scale-[0.99] transition-transform",
  mobileCardHeader: "flex justify-between items-start mb-4",
  mobileCardBody: "grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.05]",
  mobileRow: "flex flex-col",
  mobileLabel: "text-[10px] text-gray-500 uppercase font-bold",
  mobileValue: "text-sm text-gray-300 font-mono",

  // Utilities
  loadingContainer: "flex flex-col items-center justify-center py-20",
  spinner: "w-10 h-10 border-4 border-[#00D68F] border-t-transparent rounded-full animate-spin mb-4",
  loadingText: "text-[#00D68F] font-bold animate-pulse text-sm",
  
  emptyState: "flex flex-col items-center justify-center py-20 text-gray-500",
  emptyIcon: "text-4xl mb-2 grayscale opacity-50",
  emptyText: "text-sm font-medium",
  errorBox: "text-red-400 bg-red-500/10 p-4 rounded-xl border border-red-500/20 mb-8 text-center text-sm font-bold",

  // Backgrounds
  glowTop: "absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#00D68F]/5 rounded-full blur-[120px] pointer-events-none",
  glowBottom: "absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none",
};