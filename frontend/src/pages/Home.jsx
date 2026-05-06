// src/pages/Home.jsx
import React, { useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { heroStyles, ctaStyles } from '../components/HomeStyles';
import TrendingSection from '../components/TrendingSection';
import FeaturesSection from '../components/FeaturesSection';
import StepsSection from '../components/StepsSection';
import heroVideo from '../assets/Droneshot.mp4';

const SKIP_LAST_SECS = 4;

const Home = () => {
  const user = useSelector((state) => state.auth.user);
  const navigate = useNavigate();

  // for skipping last 4 seconds of video
  const videoRef = useRef(null);
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (v.currentTime >= v.duration - SKIP_LAST_SECS) {
      v.currentTime = 0;
    }
  }, []);

  
  return (
    <div className="bg-[#0b0c0e] min-h-screen selection:bg-[#00D68F] selection:text-black">
      
      {/* --- HERO SECTION --- */}
      <section className={heroStyles.section}>
        <video
          ref={videoRef}
          className={heroStyles.video}
          autoPlay loop muted playsInline
          onTimeUpdate={handleTimeUpdate}
        >
          <source src={heroVideo} type="video/mp4" />
        </video>
        <div className={heroStyles.overlay} />

        <motion.div 
          className={heroStyles.content}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className={heroStyles.title}>
            The Future of <span className="text-[#00D68F]">Exchange</span>
          </h1>
          
          <p className={heroStyles.subtitle}>
            {user
              ? `Welcome back, ${user.name || user.email}. Your portfolio is ready.`
              : "Trade, swap, and manage your assets with the world's most secure and advanced crypto exchange platform."
            }
          </p>

          <div className={heroStyles.ctaGroup}>
            <button
              className={heroStyles.ctaPrimary}
              onClick={() => navigate('/trade')}
            >
              Start Trading Now
            </button>
            <button
              className={heroStyles.ctaSecondary}
              onClick={() => navigate('/markets')}
            >
              Explore Markets
            </button>
          </div>
        </motion.div>
      </section>

      {/* --- TRENDING MARKETS --- */}
      {/* <TrendingSection /> */}

      {/* --- STEPS SECTION --- */}
      <StepsSection />

      {/* --- FEATURES SECTION --- */}
      <FeaturesSection />

      {/* --- CALL TO ACTION (CTA) --- */}
      <section className={ctaStyles.section}>
        <motion.div 
          className={ctaStyles.container}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <div className={ctaStyles.glow} />
          
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}
          />
          
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0e] via-transparent to-transparent opacity-60" />

          <div className={ctaStyles.content}>
            <h2 className={ctaStyles.title}>Ready to start trading?</h2>
            <p className={ctaStyles.desc}>
              Join the world's most comprehensive and secure crypto exchange. 
              <br className="hidden md:block" /> 
              Get started with zero fees on your first transaction.
            </p>
            
            <div className={ctaStyles.buttonGroup}>
              <button
                className={ctaStyles.primaryBtn}
                onClick={() => navigate('/signup')}
              >
                Create Account
              </button>
              <button
                className={ctaStyles.secondaryBtn}
                onClick={() => navigate('/markets')}
              >
                View Exchange
              </button>
            </div>
          </div>
        </motion.div>
      </section>
      
    </div>
  );
};

export default Home;