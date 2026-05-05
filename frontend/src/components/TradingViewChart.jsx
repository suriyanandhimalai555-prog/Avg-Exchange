// frontend/src/components/TradingViewChart.jsx
import React, { useEffect, useRef, memo } from 'react';

const TradingViewChart = ({ symbol }) => {
  const container = useRef();

  useEffect(() => {
    if (!container.current) return;

    // Clear any previous chart instance
    container.current.innerHTML = '';

    // Track whether this effect cycle is still active.
    // TradingView's script fires querySelector after loading — if the symbol
    // changed (or the component unmounted) in the meantime, the container
    // may no longer exist, causing the "Cannot read properties of null" error.
    let active = true;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;

    script.innerHTML = JSON.stringify({
      autosize:            true,
      symbol:              symbol || 'BINANCE:ETHUSDT',
      interval:            '60',
      timezone:            'Etc/UTC',
      theme:               'dark',
      style:               '1',
      locale:              'en',
      enable_publishing:   false,
      hide_top_toolbar:    false,
      hide_legend:         false,
      save_image:          false,
      backgroundColor:     'rgba(0, 0, 0, 1)',
      gridColor:           'rgba(255, 255, 255, 0.05)',
      allow_symbol_change: false,
      support_host:        'https://www.tradingview.com',
    });

    // Only append if the effect is still the current one
    if (active && container.current) {
      container.current.appendChild(script);
    }

    return () => {
      active = false;
      if (container.current) container.current.innerHTML = '';
    };
  }, [symbol]);

  // CRITICAL: height: '100%' ensures it fits the parent flex container
  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
};

export default memo(TradingViewChart);