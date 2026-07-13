// src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser } from '../features/authSlice';
import { fetchNavbarBalance, clearBalance } from '../features/balanceSlice';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IoMenu, IoClose,
  IoChevronForward, IoWalletOutline, IoBarChartOutline,
  IoSwapHorizontal, IoChevronDown, IoCopyOutline,
  IoLogOutOutline, IoCheckmarkCircle,
  IoListOutline, IoPersonOutline, IoGridOutline, IoSettingsOutline,
} from 'react-icons/io5';
import { navStyles as s } from './NavbarStyles';
import LogoWebp from '../assets/avg-exchange-logo.webp';

// Animation Variants
const menuVariants = {
  closed: { x: "100%", transition: { type: "spring", stiffness: 300, damping: 30 } },
  open: { 
    x: 0, 
    transition: { type: "spring", stiffness: 300, damping: 30, staggerChildren: 0.1, delayChildren: 0.2 } 
  }
};

const linkVariants = {
  closed: { opacity: 0, x: 50 },
  open: { opacity: 1, x: 0 }
};

const dropdownVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2 } }
};

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const user = useSelector((state) => state.auth.user);
  const totalBalance = useSelector((state) => state.balance.totalUSD);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // Helper to get display name (Name -> Email)
  const displayName = user ? (user.name || user.email) : '';

  // Load balance on login; clear on logout
  useEffect(() => {
    if (user) {
      dispatch(fetchNavbarBalance());
    } else {
      dispatch(clearBalance());
    }
  }, [user, dispatch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const handleNav = (path) => {
    setIsOpen(false);
    if (path) navigate(path);
  };

  const handleLogout = async () => {
    setIsOpen(false);
    setIsDropdownOpen(false);
    await dispatch(logoutUser());
    navigate('/login');
  };

  const copyToClipboard = () => {
    if (user?.referralCode) {
      const link = `${window.location.origin}/signup?ref=${user.referralCode}`;
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <nav className={s.nav}>
        <div className={s.container}>
          
          {/* --- LEFT SECTION --- */}
          <div className={s.leftSection}>
            <Link to="/" className={s.logoLink} onClick={() => setIsOpen(false)}>
              <img src={LogoWebp} alt="Logo" className={s.logoImg} />
              <span className="ml-1.5 mb-1 px-1.5 py-0.5 text-[9px] font-bold tracking-widest rounded bg-[#f0b90b]/15 text-[#f0b90b] border border-[#f0b90b]/30 uppercase select-none self-end" style={{ letterSpacing: '0.13em' }}>
                Beta
              </span>
            </Link>

            <div className={s.mainNav}>
              <Link to="/markets" className={s.navMenuItem}>Markets</Link>
              <Link to="/trade" className={s.navMenuItem}>Trade</Link>
            </div>
          </div>

          {/* --- RIGHT SECTION (DESKTOP) --- */}
          <div className={s.rightSection}>
            {!user ? (
              <div className={s.authGroup}>
                <Link to="/login" className={s.loginBtn}>Log In</Link>
                <Link to="/signup" className={s.signUpBtn}>Sign Up</Link>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {/* Desktop Wallet Widget */}
                {totalBalance !== null && (
                  <div 
                    onClick={() => navigate('/wallet')}
                    className="flex items-center gap-2 cursor-pointer bg-[#181a20] hover:bg-white/[0.05] px-3 py-1.5 rounded-lg border border-white/[0.05] transition-all"
                    title="Open Wallet"
                  >
                    <IoWalletOutline className="text-[#00D68F]" size={18} />
                    <span className="text-sm font-bold text-white font-mono mt-0.5">
                      ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className={s.userDropdownGroup} ref={dropdownRef}>
                  {/* Trigger */}
                <div 
                  className={s.userDropdownTrigger} 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <div className={s.userAvatarSmall}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className={s.userNameText}>{displayName}</span>
                  <IoChevronDown 
                    className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                  />
                </div>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div 
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      variants={dropdownVariants}
                      className={s.dropdownMenu}
                    >
                      {/* Referral Section Header */}
                      <div className={s.dropdownHeader}>
                        <div className={s.dropdownLabel}>Your Referral Code</div>
                        <div 
                          className={s.referralBox} 
                          onClick={copyToClipboard}
                          title="Click to copy"
                        >
                          <span className={s.referralCode}>{user.referralCode || '----'}</span>
                          {copied ? (
                            <IoCheckmarkCircle className="text-[#00D68F]" size={18} />
                          ) : (
                            <IoCopyOutline className={s.copyIcon} size={18} />
                          )}
                        </div>
                      </div>

                      {/* Menu Items */}
                      <div className="py-2 flex flex-col">
                        {user?.isAdmin && (
                          <Link to="/admin" className={s.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                            <IoSettingsOutline size={18} /> Admin Panel
                          </Link>
                        )}
                        <Link to="/dashboard" className={s.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                          <IoGridOutline size={18} /> Dashboard
                        </Link>
                        <Link to="/wallet/assets" className={s.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                          <IoWalletOutline size={18} /> Asset
                        </Link>
                        <Link to={user?.isAdmin ? '/admin/orders' : '/wallet/orders'} className={s.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                          <IoListOutline size={18} /> Orders
                        </Link>
                        <Link to="/account" className={s.dropdownItem} onClick={() => setIsDropdownOpen(false)}>
                          <IoPersonOutline size={18} /> Account & KYC
                        </Link>
                      </div>

                      {/* Logout */}
                      <button 
                        onClick={handleLogout} 
                        className={s.dropdownItemRed}
                      >
                        <IoLogOutOutline size={18} />
                        Log Out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </div>
            )}
            
          </div>

          {/* --- MOBILE CONTROLS (< XL) --- */}
          <div className="flex xl:hidden items-center gap-2">
            {/* Mobile Small Wallet Widget (< MD) */}
            {user && totalBalance !== null && (
              <div 
                onClick={() => handleNav('/wallet')}
                className="md:hidden flex items-center gap-1.5 cursor-pointer bg-[#181a20] px-2.5 py-1 rounded-md border border-white/[0.05]"
              >
                <IoWalletOutline className="text-[#00D68F]" size={14} />
                <span className="text-xs font-bold text-white font-mono mt-[1px]">
                  ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            )}

            {/* --- MOBILE HAMBURGER TOGGLE --- */}
            <button className={s.mobileToggle} onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <IoClose /> : <IoMenu />}
            </button>
          </div>
        </div>
      </nav>

      {/* --- MOBILE MENU --- */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={s.mobileMenuOverlay}
              onClick={() => setIsOpen(false)}
            />
            
            {/* Drawer */}
            <motion.div 
              initial="closed"
              animate="open"
              exit="closed"
              variants={menuVariants}
              className={s.mobileMenuContainer}
            >
              <div className={s.mobileContent}>
                
                {/* User Profile Section (Mobile) */}
                {user && (
                  <motion.div variants={linkVariants} className={s.mobileProfile}>
                    <div className={s.mobileProfileHeader}>
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00D68F] to-[#00bd7e] flex items-center justify-center text-black font-bold text-xl">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className={s.mobileProfileText}>
                        <span className={s.mobileEmail + " capitalize"}>{displayName}</span>
                        <span className={s.mobileStatus}>{user?.kycStatus === 'approved' ? 'Verified' : 'Unverified'}</span>
                      </div>
                    </div>

                    {/* Mobile Wallet Balance */}
                    {totalBalance !== null && (
                      <div 
                        onClick={() => handleNav('/wallet')}
                        className="flex items-center justify-between bg-black/40 border border-white/[0.05] rounded-lg p-3 mt-4 active:bg-black/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <IoWalletOutline className="text-[#00D68F]" size={20} />
                          <span className="text-sm text-gray-300 font-medium">Est. Balance</span>
                        </div>
                        <span className="text-[#00D68F] font-mono font-bold text-sm">
                          ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Mobile Referral Box */}
                    <div className={s.mobileReferralBox} onClick={copyToClipboard}>
                      <div className="flex flex-col">
                        <span className={s.mobileReferralLabel}>Referral Code</span>
                        <span className={s.mobileReferralCode}>{user.referralCode || '----'}</span>
                      </div>
                      {copied ? (
                        <IoCheckmarkCircle className="text-[#00D68F]" size={20} />
                      ) : (
                        <IoCopyOutline className="text-gray-400" size={20} />
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Navigation Links */}
                <div className="flex flex-col">
                  <MobileLink
                    onClick={() => handleNav('/markets')}
                    label="Markets"
                    icon={<IoBarChartOutline />}
                  />
                  <MobileLink 
                    onClick={() => handleNav('/trade')} 
                    label="Trade" 
                    icon={<IoSwapHorizontal />} 
                  />
                  {user && (
                    <>
                      <MobileLink
                        onClick={() => handleNav('/dashboard')}
                        label="Dashboard"
                        icon={<IoGridOutline />}
                      />
                      <MobileLink
                        onClick={() => handleNav('/wallet/assets')}
                        label="Assets"
                        icon={<IoWalletOutline />}
                      />
                      <MobileLink
                        onClick={() => handleNav(user?.isAdmin ? '/admin/orders' : '/wallet/orders')}
                        label="Orders"
                        icon={<IoListOutline />}
                      />
                      <MobileLink
                        onClick={() => handleNav('/account')}
                        label="Account & KYC"
                        icon={<IoPersonOutline />}
                      />
                    </>
                  )}
                </div>

                {/* Bottom Buttons */}
                <motion.div variants={linkVariants} className={s.mobileAuthSection}>
                  {!user ? (
                    <>
                      <button onClick={() => handleNav('/signup')} className={s.mobileSignUpBtn}>
                        Sign Up Now
                      </button>
                      <button onClick={() => handleNav('/login')} className={s.mobileLoginBtn}>
                        Log In
                      </button>
                    </>
                  ) : (
                    <button onClick={handleLogout} className={s.mobileLoginBtn}>
                      Log Out
                    </button>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

// Helper Component for Mobile Links
const MobileLink = ({ onClick, label, icon }) => (
  <motion.button 
    variants={linkVariants}
    onClick={onClick} 
    className={s.mobileLink}
  >
    <div className="flex items-center gap-4">
      {icon && <span className="text-[#00D68F] text-xl">{icon}</span>}
      <span className={s.mobileLinkText}>{label}</span>
    </div>
    <IoChevronForward className={s.mobileLinkIcon} />
  </motion.button>
);

export default Navbar;