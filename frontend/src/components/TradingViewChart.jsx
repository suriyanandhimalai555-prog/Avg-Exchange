// frontend/src/components/TradingViewChart.jsx
import React, { useEffect, useRef, memo } from 'react';

const TradingViewChart = ({ symbol }) => {
  const container = useRef();

  useEffect(() => {
    // Clear previous chart to prevent duplicates
    if (container.current) {
      container.current.innerHTML = ''; 
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    // Default to BINANCE:ETHUSDT if symbol is missing
    const chartSymbol = symbol || "BINANCE:ETHUSDT";

    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": chartSymbol,
      "interval": "60",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "backgroundColor": "rgba(0, 0, 0, 1)", // Match your app background
      "gridColor": "rgba(255, 255, 255, 0.05)",
      "allow_symbol_change": false,
      "support_host": "https://www.tradingview.com"
    });

    container.current.appendChild(script);
  }, [symbol]); 

  // CRITICAL: height: '100%' ensures it fits the parent flex container
  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: "100%", width: "100%" }}>
      <div className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
    </div>
  );
};

export default memo(TradingViewChart);