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
              The world's most trusted cryptocurrency exchange. Buy, trade, and hold 350+ cryptocurrencies with the lowest fees in the industry.
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
              <a href="#" className={s.link}>Margin Trading</a>
              <a href="#" className={s.link}>AVG Earn</a>
              <a href="#" className={s.link}>Wallet</a>
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
          <p className={s.copy}>© 2024 AVG Exchange. All rights reserved.</p>
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