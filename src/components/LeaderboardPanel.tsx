import React, { useState } from 'react';
import { FlightLeg } from '../types';
import { 
  RankingItem, 
  getTopRoutesByFlightCount, 
  getTopRoutesByPassengers, 
  getTopRoutesByOccupancy, 
  getTopInternationalRoutes,
  getTopAirlinesByPassengers, 
  getTopAirlinesByCargo, 
  getTopAirlinesByOccupancy,
  getTopProvincesByPassengers, 
  getTopDaysByFlights,
  formatNumber
} from '../analytics';
import { Trophy, PlaneLanding, RefreshCcw } from 'lucide-react';

interface LeaderboardPanelProps {
  records: FlightLeg[];
}

export default function LeaderboardPanel({ records }: LeaderboardPanelProps) {
  const [direction, setDirection] = useState<'arrival' | 'all'>('arrival');

  // Chuyến đến (Arrivals) Focus
  const topRoutesByFlight = getTopRoutesByFlightCount(records, direction);
  const topRoutesByPax = getTopRoutesByPassengers(records, direction);
  const topRoutesByOcc = getTopRoutesByOccupancy(records, direction);
  const topIntlRoutes = getTopInternationalRoutes(records, direction);

  // Airlines Performance
  const topAirlinesByPax = getTopAirlinesByPassengers(records, direction);
  const topAirlinesByCargo = getTopAirlinesByCargo(records, direction);
  const topAirlinesByOcc = getTopAirlinesByOccupancy(records, direction, 5); // top 5 for occupancy

  // Operations
  const topProvinces = getTopProvincesByPassengers(records, direction);
  const topDays = getTopDaysByFlights(records, direction);

  const getRankColor = (index: number) => {
    if (index === 0) return 'rank-gold';
    if (index === 1) return 'rank-silver';
    if (index === 2) return 'rank-bronze';
    return 'rank-standard';
  };

  const renderCard = (title: string, data: RankingItem[], unit: string, isPercent = false, secondaryUnit?: string) => {
    const maxValue = data.length > 0 ? data[0].value : 1; // Assuming sorted descending

    return (
      <div className="leaderboard-card">
        <h3 className="leaderboard-card-title">{title}</h3>
        {data.length === 0 ? (
          <div className="no-data">Không có dữ liệu</div>
        ) : (
          <div className="leaderboard-list">
            {data.map((item, index) => {
              const widthPct = Math.max(2, (item.value / maxValue) * 100);
              return (
                <div key={item.id} className="leaderboard-item">
                  <div className={`rank-badge ${getRankColor(index)}`}>{index + 1}</div>
                  <div className="leaderboard-item-content">
                    <div className="leaderboard-item-header">
                      <span className="leaderboard-item-label">
                        {item.label} {item.subLabel && <span className="sub-label">({item.subLabel})</span>}
                      </span>
                      <span className="leaderboard-item-value">
                        {isPercent ? item.value.toFixed(1) : formatNumber(item.value)} {unit}
                        {secondaryUnit && item.secondaryValue !== undefined && (
                          <span className="leaderboard-item-secondary">
                            {' '}({formatNumber(item.secondaryValue)} {secondaryUnit})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="leaderboard-bar-track">
                      <div className={`leaderboard-bar-fill ${getRankColor(index)}`} style={{ width: `${widthPct}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="leaderboard-panel fade-in">
      <div className="leaderboard-header-section">
        <div className="leaderboard-title">
          <Trophy className="icon-gold" size={28} />
          <h2>Bảng Xếp Hạng Khai Thác</h2>
        </div>
        <div className="leaderboard-controls">
          <button 
            className={`toggle-btn ${direction === 'arrival' ? 'active' : ''}`}
            onClick={() => setDirection('arrival')}
          >
            <PlaneLanding size={16} /> Chỉ Chuyến Đến
          </button>
          <button 
            className={`toggle-btn ${direction === 'all' ? 'active' : ''}`}
            onClick={() => setDirection('all')}
          >
            <RefreshCcw size={16} /> Tất cả (Đến & Đi)
          </button>
        </div>
      </div>

      <div className="leaderboard-section">
        <h3 className="section-heading">Phân tích Đường bay (Routes)</h3>
        <div className="leaderboard-grid">
          {renderCard("Đường bay nhộn nhịp nhất", topRoutesByFlight, "chuyến")}
          {renderCard("Đường bay đông khách nhất", topRoutesByPax, "khách")}
          {renderCard("Đường bay lấp đầy cao nhất", topRoutesByOcc, "%", true, "chuyến")}
          {renderCard("Đường bay Quốc tế đông nhất", topIntlRoutes, "khách")}
        </div>
      </div>

      <div className="leaderboard-section">
        <h3 className="section-heading">Phân tích Hãng hàng không (Airlines)</h3>
        <div className="leaderboard-grid">
          {renderCard("Hãng chở nhiều khách nhất", topAirlinesByPax, "khách")}
          {renderCard("Hãng vận chuyển nhiều Cargo/Parcel nhất", topAirlinesByCargo, "kg")}
          {renderCard("Hãng có tỷ lệ lấp đầy tốt nhất", topAirlinesByOcc, "%", true, "chuyến")}
        </div>
      </div>

      <div className="leaderboard-section">
        <h3 className="section-heading">Phân tích Tổng quan Khai thác (Operations)</h3>
        <div className="leaderboard-grid">
          {renderCard("Tỉnh/Thành phố đóng góp nhiều khách nhất", topProvinces, "khách")}
          {renderCard("Ngày cao điểm nhất (theo chuyến bay)", topDays, "chuyến")}
        </div>
      </div>
    </div>
  );
}
