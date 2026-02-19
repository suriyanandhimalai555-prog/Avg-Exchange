// frontend/src/components/TokenChart.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const TokenChart = () => {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

  useEffect(() => {
    const fetchChart = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/api/1inch/charts/candle/1`, {
          params: {
            token0: WETH,
            token1: USDC,
            seconds: 3600 
          }
        });

        // FIX: Your API returns { "data": [...] }
        const rawItems = response.data.data || [];

        if (rawItems.length === 0) {
          setError("No market data found for this pair.");
          return;
        }

        // FIX: Mapping 'time' and 'close' based on your provided JSON
        const formatted = rawItems.map(item => ({
          // Convert unix seconds to readable time
          displayTime: new Date(item.time * 1000).toLocaleTimeString([], { hour: '2-digit' }),
          price: parseFloat(item.close)
        }));

        setChartData(formatted);
        setError(null);
      } catch (err) {
        console.error("Fetch Error:", err);
        setError("Failed to load chart.");
      } finally {
        setLoading(false);
      }
    };

    fetchChart();
  }, []);

  if (loading) return <div className="h-64 flex items-center justify-center text-gray-500">Loading Market Data...</div>;
  if (error) return <div className="h-64 flex items-center justify-center text-red-400 text-xs">{error}</div>;

  return (
    <div className="w-full bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-[#00D68F] text-[10px] font-bold uppercase tracking-widest">WETH / USDC Price</h4>
        <span className="text-[10px] text-gray-500">Last 24 Hours</span>
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="chartColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00D68F" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#00D68F" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis 
                dataKey="displayTime" 
                stroke="#444" 
                fontSize={10} 
                axisLine={false} 
                tickLine={false} 
                minTickGap={30}
            />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '12px', borderRadius: '8px' }}
              itemStyle={{ color: '#00D68F' }}
              labelStyle={{ color: '#666' }}
            />
            <Area 
                type="monotone" 
                dataKey="price" 
                stroke="#00D68F" 
                fill="url(#chartColor)" 
                strokeWidth={2} 
                animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TokenChart;