// frontend/src/pages/Markets.jsx
import React, { useEffect, useState, useMemo } from 'react';
import client from '../api/client';
import { marketStyles as s } from '../components/MarketStyles';
import { IoStatsChart, IoSearch, IoTrendingUp, IoTrendingDown } from 'react-icons/io5';

const Markets = () => {
  const [cryptos, setCryptos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, gainers, losers

  useEffect(() => {
    const fetchCryptos = async () => {
      try {
        const { data } = await client.get('/api/markets', {
          params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1 },
        });
        setCryptos(data);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch markets", err);
        setError("Unable to load market data. Please try again later.");
        setLoading(false);
      }
    };

    fetchCryptos();
  }, []);

  // Calculate market stats
  const marketStats = useMemo(() => {
    if (!cryptos.length) return { totalMarketCap: 0, totalVolume: 0, gainers: 0, losers: 0 };

    const totalMarketCap = cryptos.reduce((sum, coin) => sum + (coin.market_cap || 0), 0);
    const totalVolume = cryptos.reduce((sum, coin) => sum + (coin.total_volume || 0), 0);
    const gainers = cryptos.filter(coin => (coin.price_change_percentage_24h ?? 0) > 0).length;
    const losers = cryptos.filter(coin => (coin.price_change_percentage_24h ?? 0) < 0).length;

    return { totalMarketCap, totalVolume, gainers, losers };
  }, [cryptos]);

  // Filter and search
  const filteredCryptos = useMemo(() => {
    let filtered = [...cryptos];

    if (searchTerm) {
      filtered = filtered.filter(coin =>
        coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filter === 'gainers') {
      filtered = filtered.filter(coin => (coin.price_change_percentage_24h ?? 0) > 0);
      filtered.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
    } else if (filter === 'losers') {
      filtered = filtered.filter(coin => (coin.price_change_percentage_24h ?? 0) < 0);
      filtered.sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h);
    }

    return filtered;
  }, [cryptos, searchTerm, filter]);

  const formatUSD = (num) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(num);
  };

  const formatCompact = (num) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
  };

  return (
    <>
      <div className={s.section}>
        <div className={s.glowTop} />
        <div className={s.glowBottom} />

        <div className={s.container}>
          {/* Page Header */}
          <div className={s.header}>
            <div className={s.titleWrapper}>
              <div className={s.iconBox}>
                <IoStatsChart />
              </div>
              <h1 className={s.title}>Live Crypto Markets</h1>
            </div>
            <p className={s.subtitle}>
              Track top 50 cryptocurrencies by market cap. Real-time prices, 24h changes, volume, and supply data in USD.
            </p>
          </div>

          {/* Market Stats Bar */}
          {!loading && !error && (
            <div className={s.statsBar}>
              <div className={s.statItem}>
                <div className={s.statLabel}>Market Cap</div>
                <div className={s.statValue}>{formatCompact(marketStats.totalMarketCap)}</div>
              </div>
              <div className={s.statItem}>
                <div className={s.statLabel}>24h Volume</div>
                <div className={s.statValue}>{formatCompact(marketStats.totalVolume)}</div>
              </div>
              <div className={s.statItem}>
                <div className={s.statLabel}>Gainers</div>
                <div className={s.statValue}>
                  <span className="text-[#00D68F]">{marketStats.gainers}</span>
                </div>
              </div>
              <div className={s.statItem}>
                <div className={s.statLabel}>Losers</div>
                <div className={s.statValue}>
                  <span className="text-[#ff4d4f]">{marketStats.losers}</span>
                </div>
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          {!loading && !error && (
            <div className={s.controlsBar}>
              <div className={s.searchWrapper}>
                <IoSearch className={s.searchIcon} />
                <input
                  type="text"
                  placeholder="Search coins..."
                  className={s.searchInput}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className={s.filterGroup}>
                <button
                  onClick={() => setFilter('all')}
                  className={`${s.filterBtn} ${filter === 'all' ? s.filterBtnActive : s.filterBtnInactive}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('gainers')}
                  className={`${s.filterBtn} ${filter === 'gainers' ? s.filterBtnActive : s.filterBtnInactive}`}
                >
                  <IoTrendingUp className="inline md:mr-1" /> <span className="hidden md:inline">Gainers</span>
                </button>
                <button
                  onClick={() => setFilter('losers')}
                  className={`${s.filterBtn} ${filter === 'losers' ? s.filterBtnActive : s.filterBtnInactive}`}
                >
                  <IoTrendingDown className="inline md:mr-1" /> <span className="hidden md:inline">Losers</span>
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className={s.errorBox}>
              <div className={s.errorText}>{error}</div>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className={s.loadingContainer}>
              <div className={s.spinner} />
              <div className={s.loadingText}>Loading Markets...</div>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className={s.tableWrapper}>
                <table className={s.table}>
                  <thead className={s.thead}>
                    <tr className={s.thRow}>
                      <th className={`${s.th} pl-6`}>#</th>
                      <th className={s.th}>Name</th>
                      <th className={`${s.th} text-right`}>Price</th>
                      <th className={`${s.th} text-right`}>24h %</th>
                      <th className={`${s.th} text-right`}>Market Cap</th>
                      <th className={`${s.th} text-right`}>Volume</th>
                      <th className={`${s.th} text-right pr-6`}>Supply</th>
                    </tr>
                  </thead>
                  <tbody className={s.tbody}>
                    {filteredCryptos.map((coin, idx) => {
                      const change = coin.price_change_percentage_24h ?? 0;
                      const changeClass = change > 0 ? s.positive : change < 0 ? s.negative : s.neutral;

                      return (
                        <tr key={coin.id} className={s.tr}>
                          <td className={`${s.td} pl-6 w-12`}>
                            <span className={s.rank}>{idx + 1}</span>
                          </td>
                          <td className={s.td}>
                            <div className={s.coinInfo}>
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className={s.coinIcon}
                                loading="lazy"
                              />
                              <div className={s.coinText}>
                                <div className={s.name}>{coin.name}</div>
                                <div className={s.symbol}>{coin.symbol.toUpperCase()}</div>
                              </div>
                            </div>
                          </td>
                          <td className={`${s.td} text-right`}>
                            <div className={s.price}>{formatUSD(coin.current_price)}</div>
                          </td>
                          <td className={`${s.td} text-right`}>
                            <div className={`${s.changeWrapper} ${changeClass} justify-end`}>
                              <span className={s.changeIcon}>
                                {change > 0 ? '▲' : change < 0 ? '▼' : '●'}
                              </span>
                              {Math.abs(change).toFixed(2)}%
                            </div>
                          </td>
                          <td className={`${s.td} text-right`}>
                            <div className={s.marketCap}>{formatCompact(coin.market_cap)}</div>
                          </td>
                          <td className={`${s.td} text-right`}>
                            <div className={s.volume}>{formatCompact(coin.total_volume)}</div>
                          </td>
                          <td className={`${s.td} text-right pr-6`}>
                            <div className={s.supply}>
                              {formatNumber(coin.circulating_supply)}
                              <span className={s.supplySymbol}>{coin.symbol.toUpperCase()}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className={s.mobileContainer}>
                {filteredCryptos.map((coin) => {
                  const change = coin.price_change_percentage_24h ?? 0;
                  const changeClass = change > 0 ? s.positive : change < 0 ? s.negative : s.neutral;

                  return (
                    <div key={coin.id} className={s.mobileCard}>
                      <div className={s.mobileCardHeader}>
                        <div className={s.coinInfo}>
                          <img
                            src={coin.image}
                            alt={coin.name}
                            className={s.coinIcon}
                            loading="lazy"
                          />
                          <div className={s.coinText}>
                            <div className={s.name}>{coin.name}</div>
                            <div className={s.symbol}>{coin.symbol.toUpperCase()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={s.price}>{formatUSD(coin.current_price)}</div>
                          <div className={`${s.changeWrapper} ${changeClass} justify-end mt-1`}>
                            <span className={s.changeIcon}>
                              {change > 0 ? '▲' : change < 0 ? '▼' : '●'}
                            </span>
                            {Math.abs(change).toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div className={s.mobileCardBody}>
                        <div className={s.mobileRow}>
                          <span className={s.mobileLabel}>M.Cap</span>
                          <span className={s.mobileValue}>{formatCompact(coin.market_cap)}</span>
                        </div>
                        <div className={s.mobileRow}>
                          <span className={s.mobileLabel}>Vol(24h)</span>
                          <span className={s.mobileValue}>{formatCompact(coin.total_volume)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty State */}
              {filteredCryptos.length === 0 && (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>🔍</div>
                  <div className={s.emptyText}>No cryptocurrencies found matching "{searchTerm}"</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Markets;
