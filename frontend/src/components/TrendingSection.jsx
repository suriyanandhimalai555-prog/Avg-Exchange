// src/components/TrendingSection.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { trendingStyles as s } from './HomeStyles';
import { IoFlame, IoTrendingUp, IoRocket } from 'react-icons/io5';

const TrendingSection = () => {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const { data } = await axios.get('http://localhost:4000/api/trending'); 
        if (Array.isArray(data)) setCryptoData(data);
        setLoading(false);
      } catch (err) { 
        console.error("Market refresh failed", err);
        setLoading(false);
      }
    };
    fetchMarketData();
  }, []);

  return (
    <section className={s.section}>
      <div className={s.container}>
        <motion.div
          className={s.header}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }} // Changed
        >
          <h2 className={s.title}>Market Trends</h2>
          <p className={s.subtitle}>Real-time updates on the most active assets.</p>
        </motion.div>

        <div className={s.grid}>
          <MarketCard 
            title="Hot Coins" 
            icon={<IoFlame className="text-orange-500" />} 
            data={cryptoData.slice(0, 5)} 
            delay={0.1} 
          />
          <MarketCard 
            title="New Listings" 
            icon={<IoRocket className="text-blue-500" />} 
            data={cryptoData.slice(5, 10)} 
            delay={0.2} 
          />
          <MarketCard 
            title="Top Gainers" 
            icon={<IoTrendingUp className="text-[#00D68F]" />} 
            data={cryptoData.slice(10, 15)} 
            delay={0.3} 
          />
        </div>
      </div>
    </section>
  );
};

const MarketCard = ({ title, icon, data, delay }) => (
  <motion.div 
    className={s.card}
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: false, amount: 0.2 }} // Changed
    transition={{ delay: delay, duration: 0.5 }}
  >
    <div className={s.cardTitle}>
      {icon} <span>{title}</span>
    </div>
    
    <div className="flex flex-col gap-2">
      {data.length > 0 ? data.map((coin) => (
        <div key={coin.id} className={s.coinRow}>
          <div className={s.coinLeft}>
            <img src={coin.image} alt={coin.name} className={s.coinIcon} />
            <div>
              <div className={s.coinSymbol}>{coin.symbol.toUpperCase()}</div>
              <div className={s.coinName}>{coin.name}</div>
            </div>
          </div>
          <div className={s.coinRight}>
            <div className={s.coinPrice}>${coin.current_price?.toLocaleString()}</div>
            <div className={`${s.coinChange} ${coin.price_change_percentage_24h >= 0 ? 'text-[#00D68F]' : 'text-red-500'}`}>
              {coin.price_change_percentage_24h > 0 ? '+' : ''}
              {coin.price_change_percentage_24h?.toFixed(2)}%
            </div>
          </div>
        </div>
      )) : (
        <div className="text-center py-10 text-gray-500 text-sm">Loading market data...</div>
      )}
    </div>
  </motion.div>
);

export default TrendingSection;