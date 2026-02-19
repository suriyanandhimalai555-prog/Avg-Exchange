// AuthStyles.js
export const authStyles = {
  // Main container: Full screen, flex layout for split screen
  wrapper: "flex min-h-screen w-full bg-[#0b0c0e] font-sans",

  // --- LEFT SIDE (Video & Branding) ---
  // Hidden on mobile (lg:flex), takes up 50% width
  leftSection: "hidden lg:flex relative w-1/2 flex-col justify-end overflow-hidden",
  
  // The Video Element styling
  videoBg: "absolute inset-0 w-full h-full object-cover",
  
  // Gradient overlay to make text readable against any video
  overlay: "absolute inset-0 bg-gradient-to-t from-[#0b0c0e] via-[#0b0c0e]/70 to-transparent",
  
  // Text content wrapper
  textContent: "relative z-10 p-16 pb-20 max-w-2xl",
  heroTitle: "text-5xl font-bold text-white mb-6 leading-[1.1] tracking-tight",
  heroSubtitle: "text-lg text-[#848e9c] leading-relaxed",

  // --- RIGHT SIDE (Form) ---
  // Centered content, takes 100% on mobile, 50% on desktop
  rightSection: "w-full lg:w-1/2 flex flex-col justify-center items-center px-6 sm:px-12 bg-[#0b0c0e]",
  
  // Form Container (Constrains width for better readability)
  formContainer: "w-full max-w-[440px]",
  
  // Form Header
  header: "mb-10",
  title: "text-3xl font-bold text-white mb-3 tracking-tight",
  subTitle: "text-[#848e9c] text-sm font-medium",

  // Inputs
  inputGroup: "mb-6",
  label: "block text-[#848e9c] text-xs font-bold uppercase tracking-wider mb-2 ml-1",
  input: "w-full bg-[#1e2026] border border-[#2b2f36] rounded-xl p-4 text-white placeholder-[#474d57] focus:border-[#00D68F] focus:ring-1 focus:ring-[#00D68F] outline-none transition-all text-sm font-medium",
  
  // Submit Button
  submitBtn: "w-full bg-[#00D68F] hover:bg-[#00ba7c] text-[#0b0c0e] font-bold py-4 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 text-sm uppercase tracking-wide",
  
  // Footer Links (e.g., "Don't have an account?")
  footerText: "mt-8 text-center text-[#848e9c] text-sm",
  link: "text-[#00D68F] hover:text-[#00ba7c] font-semibold ml-1 cursor-pointer transition-colors",

  // Error Box
  errorBox: "mt-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm text-center font-medium animate-pulse"
};