// src/components/HomeStyles.js

// --- HERO SECTION STYLES ---
export const heroStyles = {
  section: "relative w-full h-screen flex items-center justify-center overflow-hidden bg-[#0b0c0e]",
  video: "absolute inset-0 w-full h-full object-cover z-0 opacity-50", 
  overlay: "absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-[#0b0c0e] z-10", 
  content: "relative z-20 text-center px-6 max-w-5xl mx-auto -mt-24",
  title: "text-5xl md:text-7xl lg:text-8xl font-black text-white mb-8 tracking-tighter leading-[1.1] drop-shadow-2xl",
  subtitle: "text-lg md:text-2xl text-gray-300 mb-10 max-w-3xl mx-auto font-light tracking-wide leading-relaxed",
  ctaGroup: "flex flex-col sm:flex-row gap-5 justify-center items-center",
  ctaPrimary: "bg-[#00D68F] text-black px-10 py-4 rounded-full font-bold text-lg hover:bg-[#00bd7e] hover:shadow-[0_0_40px_-10px_rgba(0,214,143,0.5)] transition-all transform hover:scale-105 active:scale-95",
  ctaSecondary: "px-10 py-4 rounded-full font-bold text-lg border border-white/20 text-white hover:bg-white/10 backdrop-blur-md transition-all",
};

// --- STATS BAR STYLES ---
export const statsStyles = {
  section: "w-full border-y border-white/[0.05] bg-[#0b0c0e]/50 backdrop-blur-md relative z-20 -mt-20 mb-20", 
  container: "max-w-7xl mx-auto px-6 py-10",
  grid: "grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-white/[0.05]", 
  item: "flex flex-col items-center justify-center text-center",
  value: "text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight",
  label: "text-xs md:text-sm text-[#76808f] font-semibold uppercase tracking-widest",
};

// --- TRENDING SECTION STYLES ---
export const trendingStyles = {
  section: "py-24 bg-[#0b0c0e] relative",
  container: "max-w-7xl mx-auto px-6",
  header: "text-center mb-16",
  title: "text-3xl md:text-5xl font-bold text-white mb-4",
  subtitle: "text-[#76808f] text-lg max-w-2xl mx-auto",
  grid: "grid grid-cols-1 md:grid-cols-3 gap-8",
  card: "bg-[#181a20] rounded-3xl p-6 border border-[#2b2f36] hover:border-[#00D68F]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#00D68F]/5",
  cardTitle: "text-xl font-bold text-white mb-6 flex items-center gap-2",
  coinRow: "flex items-center justify-between py-4 border-b border-dashed border-[#2b2f36] last:border-0 group cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors",
  coinLeft: "flex items-center gap-3",
  coinIcon: "w-8 h-8 rounded-full object-contain bg-white/5 p-0.5",
  coinSymbol: "text-white font-bold text-sm",
  coinName: "text-[#76808f] text-xs",
  coinRight: "text-right",
  coinPrice: "text-white font-medium text-sm",
  coinChange: "text-xs font-bold",
};

// --- STEPS (GET STARTED) SECTION STYLES ---
export const stepsStyles = {
  section: "py-32 bg-[#0b0c0e] relative overflow-hidden",
  container: "max-w-7xl mx-auto px-6 relative z-10",
  
  // Ambient Background Lights
  glowLeft: "absolute top-1/4 left-[-10%] w-[600px] h-[600px] bg-[#00D68F]/10 blur-[150px] rounded-full pointer-events-none animate-pulse",
  glowRight: "absolute bottom-1/4 right-[-10%] w-[600px] h-[600px] bg-purple-500/10 blur-[150px] rounded-full pointer-events-none animate-pulse",

  header: "text-center mb-24 relative z-20",
  title: "text-4xl md:text-6xl font-black text-white mb-6 tracking-tight drop-shadow-xl",
  subtitle: "text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed",
  highlight: "text-transparent bg-clip-text bg-gradient-to-r from-[#00D68F] to-cyan-400", 

  grid: "grid grid-cols-1 md:grid-cols-3 gap-10 relative",
  
  // Connector Line
  connectorContainer: "hidden md:block absolute top-[100px] left-0 w-full h-1 z-0",
  connectorLine: "w-full h-full bg-gradient-to-r from-transparent via-gray-700/50 to-transparent",

  // Base Card Style (Colors applied dynamically in JSX)
  stepCard: "relative z-10 bg-[#121418] p-8 pb-12 rounded-[2.5rem] border border-white/[0.08] overflow-hidden group hover:-translate-y-3 transition-all duration-500 hover:shadow-2xl",
  
  // The Glowing Number (Now visible!)
  numberBox: "absolute -right-4 -top-4 w-32 h-32 rounded-full blur-[40px] opacity-20 transition-all duration-500 group-hover:opacity-40",
  numberText: "absolute top-6 right-8 text-6xl font-black text-white/10 group-hover:text-white/20 transition-colors z-10 select-none font-mono",
  
  // Icon Area
  iconWrapper: "relative w-20 h-20 rounded-2xl flex items-center justify-center text-3xl mb-10 transition-all duration-500 group-hover:scale-110 shadow-lg border border-white/10 backdrop-blur-md",
  
  // Text Content
  content: "relative z-20",
  stepTitle: "text-2xl font-bold text-white mb-4 transition-colors",
  stepDesc: "text-gray-400 leading-relaxed group-hover:text-gray-200 transition-colors font-medium",
  
  // New: Bottom Glow Bar
  bottomBar: "absolute bottom-0 left-0 w-full h-1.5 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"
};

// --- FEATURES SECTION STYLES ---
export const featureStyles = {
  section: "py-32 bg-[#0b0c0e] relative overflow-hidden",
  bgGlow: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00D68F]/5 blur-[120px] rounded-full pointer-events-none",
  container: "max-w-7xl mx-auto px-6 relative z-10",
  header: "text-center mb-20 max-w-3xl mx-auto",
  title: "text-3xl md:text-5xl font-bold text-white mb-6",
  subtitle: "text-[#76808f] text-lg leading-relaxed",
  grid: "grid grid-cols-1 md:grid-cols-3 gap-8",
  card: "group p-10 rounded-[2rem] bg-gradient-to-b from-[#181a20] to-[#0b0c0e] border border-[#2b2f36] hover:border-[#00D68F]/50 transition-all duration-500 relative overflow-hidden",
  iconWrapper: "w-16 h-16 rounded-2xl bg-[#00D68F]/10 flex items-center justify-center mb-8 text-[#00D68F] group-hover:scale-110 group-hover:bg-[#00D68F] group-hover:text-black transition-all duration-300",
  cardTitle: "text-2xl font-bold text-white mb-4",
  cardText: "text-[#76808f] leading-relaxed text-base",
};

// --- CTA SECTION STYLES ---
export const ctaStyles = {
  section: "py-24 px-6 bg-[#0b0c0e] relative overflow-hidden",
  
  // CONTAINER: Sharper corners, subtle border, noise texture feel
  container: `
    relative max-w-5xl mx-auto rounded-[2rem] 
    bg-gradient-to-b from-[#1e2026] to-[#121418] 
    border border-[#2b2f36] 
    p-12 md:p-20 text-center 
    shadow-2xl shadow-black/50
    overflow-hidden
  `,

  // DECORATION: A subtle top highlight line to give it a "glass edge" look
  glow: "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00D68F]/50 to-transparent opacity-50",
  
  content: "relative z-10 flex flex-col items-center max-w-3xl mx-auto",
  
  // TITLE: Pure white, tight tracking, serious font weight
  title: "text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight leading-tight",
  
  // DESC: Clean grey, better readability
  desc: "text-[#848e9c] text-lg md:text-xl mb-10 leading-relaxed font-normal",
  
  buttonGroup: "flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto",
  
  // PRIMARY BTN: High contrast, sharp text, no blurry shadow
  primaryBtn: `
    w-full sm:w-auto bg-[#00D68F] text-[#0b0c0e] 
    px-8 py-4 rounded-xl font-semibold text-base 
    hover:bg-[#00e096] transition-colors duration-200 
    shadow-[0_2px_10px_rgba(0,214,143,0.15)]
  `,
  
  // SECONDARY BTN: Clean outline, subtle hover background
  secondaryBtn: `
    w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base 
    text-white bg-[#2b2f36]/30 border border-[#2b2f36] 
    hover:bg-[#2b2f36] hover:border-gray-500 
    transition-all duration-200
  `,
};


// --- FOOTER STYLES ---
export const footerStyles = {
  wrapper: "bg-[#0b0c0e] border-t border-white/[0.05] pt-24 pb-12",
  container: "max-w-7xl mx-auto px-6",
  grid: "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-20",
  brandCol: "col-span-2 lg:col-span-2 pr-10",
  logoText: "text-3xl font-bold text-white mb-6 block tracking-tight",
  desc: "text-[#76808f] mb-8 max-w-sm leading-relaxed text-sm",
  colTitle: "text-white font-bold mb-8 text-lg",
  linkList: "flex flex-col gap-4",
  link: "text-[#76808f] hover:text-[#00D68F] transition-colors text-sm font-medium",
  bottomBar: "border-t border-white/[0.05] pt-10 flex flex-col md:flex-row justify-between items-center gap-6",
  copy: "text-[#76808f] text-sm",
  socialGroup: "flex items-center gap-6",
  socialIcon: "text-gray-400 hover:text-[#00D68F] transition-colors text-2xl cursor-pointer",
};