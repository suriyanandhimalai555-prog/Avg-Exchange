// src/components/Footer.jsx
import React from 'react';
import { IoLogoTwitter, IoLogoDiscord, IoLogoGithub, IoLogoInstagram } from 'react-icons/io5';
import { footerStyles as s } from './HomeStyles';

const Footer = () => {
  return (
    <footer className={s.wrapper}>
      <div className={s.container}>
        <div className={s.grid}>
          
          <div className={s.brandCol}>
            <span className={s.logoText}>AVG Exchange</span>
            <p className={s.desc}>
              A fast, secure cryptocurrency spot exchange. Trade 15 digital assets against USDT with zero trading fees and full KYC compliance.
            </p>
          </div>

          <div>
            <h4 className={s.colTitle}>Company</h4>
            <div className={s.linkList}>
              <a href="#" className={s.link}>About Us</a>
              <a href="#" className={s.link}>Careers</a>
              <a href="#" className={s.link}>Press</a>
              <a href="#" className={s.link}>Community</a>
            </div>
          </div>

          <div>
            <h4 className={s.colTitle}>Products</h4>
            <div className={s.linkList}>
              <a href="#" className={s.link}>Spot Trading</a>
              <a href="#" className={s.link}>Markets</a>
              <a href="#" className={s.link}>Wallet</a>
              <a href="#" className={s.link}>Referrals</a>
            </div>
          </div>

          <div>
            <h4 className={s.colTitle}>Support</h4>
            <div className={s.linkList}>
              <a href="#" className={s.link}>Help Center</a>
              <a href="#" className={s.link}>Trading Fees</a>
              <a href="#" className={s.link}>API Documentation</a>
              <a href="#" className={s.link}>Contact Us</a>
            </div>
          </div>
        </div>

        <div className={s.bottomBar}>
          <p className={s.copy}>© 2026 AVG Exchange. All rights reserved.</p>
          <div className={s.socialGroup}>
            <IoLogoTwitter className={s.socialIcon} />
            <IoLogoDiscord className={s.socialIcon} />
            <IoLogoGithub className={s.socialIcon} />
            <IoLogoInstagram className={s.socialIcon} />
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;