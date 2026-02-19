// src/components/FeaturesSection.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { IoShieldCheckmarkOutline, IoFlashOutline, IoHeadsetOutline } from 'react-icons/io5';
import { featureStyles as s } from './HomeStyles';

const features = [
  {
    icon: <IoShieldCheckmarkOutline size={32} />,
    title: "Bank-Grade Security",
    desc: "We use cold storage, multi-sig wallets, and real-time monitoring to ensure your funds are never compromised."
  },
  {
    icon: <IoFlashOutline size={32} />,
    title: "Lightning Fast Engine",
    desc: "Our matching engine handles 100,000+ TPS with less than 1ms latency, ensuring your orders execute instantly."
  },
  {
    icon: <IoHeadsetOutline size={32} />,
    title: "24/7 Global Support",
    desc: "Get help whenever you need it. Our multilingual support team is available via live chat and email around the clock."
  }
];

const FeaturesSection = () => {
  return (
    <section className={s.section}>
      <div className={s.bgGlow} />
      <div className={s.container}>
        
        <motion.div 
          className={s.header}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }} // Changed
        >
          <h2 className={s.title}>Why Trade with Us?</h2>
          <p className={s.subtitle}>
            Experience the next generation of crypto exchange technology.
          </p>
        </motion.div>

        <div className={s.grid}>
          {features.map((feature, idx) => (
            <motion.div 
              key={idx}
              className={s.card}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }} // Changed
              transition={{ delay: idx * 0.1 }}
            >
              <div className={s.iconWrapper}>
                {feature.icon}
              </div>
              <h3 className={s.cardTitle}>{feature.title}</h3>
              <p className={s.cardText}>{feature.desc}</p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};

export default FeaturesSection;