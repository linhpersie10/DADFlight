import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Database,
  Filter,
  MapPinned,
  Package,
  Plane,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { formatAirport } from "./airportReference";
import {
  buildAirportOptions,
  buildCountryOptions,
  buildProvinceOptions,
  filterRecords,
  formatDate,
  formatNumber,
  summarizeByAirline,
  summarizeByMarket,
  summarizeByOrigin,
  totals,
} from "./analytics";
import { parseFlightExcel } from "./excelParser";
import { loadDatasets, saveDatasets } from "./storage";
import type { DashboardFilters, FlightDataset, FlightLeg, SummaryRow } from "./types";
import "./styles.css";

const INITIAL_FILTERS: DashboardFilters = {
  direction: "all",
  origin: "",
  country: "",
  province: "",
  search: "",
};

type TabKey = "market" | "origin" | "airline" | "detail";

function kg(value: number): string {
  return `${formatNumber(value)} kg`;
}

function transit(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

// Clock component
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="topbar-clock">
      <div className="clock-time">
        {now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
      <div className="clock-date">
        {now.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
      </div>
    </div>
  );
}

type ColorVariant = "cyan" | "blue" | "gold" | "green" | "purple";

function ScoreCard({
  label,
  value,
  detail,
  icon,
  color = "cyan",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  color?: ColorVariant;
}) {
  return (
    <div className={`score-card color-${color}`}>
      <div className={`score-icon color-${color}`}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="score-label">{label}</div>
        <div className="score-value">{value}</div>
        <div className="score-detail">{detail}</div>
      </div>
    </div>
  );
}

function SummaryTable({ rows, maxPassengers }: { rows: SummaryRow[]; maxPassengers: number }) {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Điểm</th>
              <th>Quốc gia</th>
              <th>Tỉnh/TP</th>
              <th className="number">Chuyến</th>
              <th className="number">Đến</th>
              <th className="number">Đi</th>
              <th className="number">Khách</th>
              <th className="number">Hành lý</th>
              <th className="number">Bưu kiện</th>
              <th className="number">Hàng hóa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const width = maxPassengers ? Math.max(4, Math.round((row.passengers / maxPassengers) * 100)) : 0;
              return (
                <tr key={row.key}>
                  <td>
                    <span className="row-rank">{index + 1}</span>
                  </td>
                  <td>
                    <div className="main-cell">{row.label}</div>
                    <div className="muted">{row.subLabel}</div>
                  </td>
                  <td style={{ fontSize: "0.82rem" }}>{row.country || "—"}</td>
                  <td style={{ fontSize: "0.82rem" }}>{row.province || "—"}</td>
                  <td className="number">{formatNumber(row.flightCount)}</td>
                  <td className="number">{formatNumber(row.arrivals)}</td>
                  <td className="number">{formatNumber(row.departures)}</td>
                  <td className="number with-bar">
                    <span style={{ fontWeight: 700 }}>{formatNumber(row.passengers)}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${width}%` }} />
                    </span>
                  </td>
                  <td className="number">{kg(row.baggageKg)}</td>
                  <td className="number">{kg(row.parcelKg)}</td>
                  <td className="number">{kg(row.cargoKg)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={11} className="empty-cell">
                  Không có dữ liệu phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="table-footer">
          <span>{rows.length} điểm</span>
          <span>Tổng khách: {formatNumber(rows.reduce((s, r) => s + r.passengers, 0))}</span>
        </div>
      )}
    </>
  );
}

function DetailTable({ records }: { records: FlightLeg[] }) {
  return (
    <>
      <div className="table-wrap detail-table">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Hãng</th>
              <th>Số hiệu</th>
              <th>Chặng leg</th>
              <th>Chiều</th>
              <th>Loại MB</th>
              <th className="number">Khách</th>
              <th className="number">ADL</th>
              <th className="number">CHD</th>
              <th className="number">INF</th>
              <th className="number">Hành lý</th>
              <th className="number">Bưu kiện</th>
              <th className="number">Hàng hóa</th>
              <th className="number">Transit</th>
              <th>Dòng gốc</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td style={{ fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>{formatDate(record.reportDate)}</td>
                <td style={{ fontWeight: 700, fontSize: "0.85rem" }}>{record.airline}</td>
                <td>
                  <div className="main-cell">{record.flightNo}</div>
                  {record.originalFlightNo !== record.flightNo && (
                    <div className="muted">Gốc: {record.originalFlightNo}</div>
                  )}
                </td>
                <td>
                  <div className="main-cell">{record.route}</div>
                  {record.originalRoute !== record.route && (
                    <div className="muted">Từ {record.originalRoute}</div>
                  )}
                </td>
                <td>
                  <span className={`direction-pill ${record.direction}`}>
                    {record.direction === "arrival" ? "↓ Đến DAD" : "↑ Đi từ DAD"}
                  </span>
                </td>
                <td style={{ fontSize: "0.82rem" }}>{record.aircraftType}</td>
                <td className="number" style={{ fontWeight: 700 }}>{formatNumber(record.passengerTotal)}</td>
                <td className="number">{formatNumber(record.adult)}</td>
                <td className="number">{formatNumber(record.child)}</td>
                <td className="number">{formatNumber(record.infant)}</td>
                <td className="number">{kg(record.baggageKg)}</td>
                <td className="number">{kg(record.parcelKg)}</td>
                <td className="number">{kg(record.cargoKg)}</td>
                <td className="number">{transit(record.transitKg)}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>#{record.sourceRow}</td>
              </tr>
            ))}
            {!records.length && (
              <tr>
                <td colSpan={15} className="empty-cell">
                  Không có leg bay phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {records.length > 0 && (
        <div className="table-footer">
          <span>{formatNumber(records.length)} leg bay</span>
          <span>
            Tổng khách: {formatNumber(records.reduce((s, r) => s + r.passengerTotal, 0))}
          </span>
        </div>
      )}
    </>
  );
}

function App() {
  const [datasets, setDatasets] = useState<FlightDataset[]>(() => loadDatasets());
  const [activeDate, setActiveDate] = useState(() => loadDatasets()[0]?.reportDate ?? "");
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS);
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { saveDatasets(datasets); }, [datasets]);

  useEffect(() => {
    if (!activeDate && datasets[0]) setActiveDate(datasets[0].reportDate);
    if (activeDate && !datasets.some((d) => d.reportDate === activeDate)) {
      setActiveDate(datasets[0]?.reportDate ?? "");
    }
  }, [activeDate, datasets]);

  const activeDataset = useMemo(
    () => datasets.find((d) => d.reportDate === activeDate) ?? datasets[0],
    [activeDate, datasets],
  );

  const records = activeDataset?.records ?? [];
  const filteredRecords = useMemo(() => filterRecords(records, filters), [records, filters]);
  const filteredTotals = useMemo(() => totals(filteredRecords), [filteredRecords]);
  const marketRows = useMemo(() => summarizeByMarket(filteredRecords), [filteredRecords]);
  const originRows = useMemo(() => summarizeByOrigin(filteredRecords), [filteredRecords]);
  const airlineRows = useMemo(() => summarizeByAirline(filteredRecords), [filteredRecords]);
  const maxPassengers = Math.max(0, ...marketRows.map((r) => r.passengers), ...originRows.map((r) => r.passengers), ...airlineRows.map((r) => r.passengers));

  const originOptions = useMemo(() => buildAirportOptions(records), [records]);
  const countryOptions = useMemo(() => buildCountryOptions(records), [records]);
  const provinceOptions = useMemo(() => buildProvinceOptions(records, filters.country), [records, filters.country]);

  useEffect(() => {
    if (filters.province && !provinceOptions.includes(filters.province)) {
      setFilters((f) => ({ ...f, province: "" }));
    }
  }, [filters.province, provinceOptions]);

  const hasActiveFilters = filters.direction !== "all" || filters.origin || filters.country || filters.province || filters.search;

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const dataset = await parseFlightExcel(file);
      setDatasets((current) => {
        const without = current.filter((d) => d.reportDate !== dataset.reportDate);
        return [dataset, ...without].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
      });
      setActiveDate(dataset.reportDate);
      setFilters(INITIAL_FILTERS);
      setMessage(`✓ Đã nhập ${formatNumber(dataset.sourceFlightRows)} dòng → ${formatNumber(dataset.legCount)} leg bay (${formatDate(dataset.reportDate)})`);
    } catch (error) {
      setMessage(`✕ ${error instanceof Error ? error.message : "Không thể đọc file Excel."}`);
    } finally {
      setImporting(false);
    }
  }

  function removeDataset(reportDate: string) {
    setDatasets((current) => current.filter((d) => d.reportDate !== reportDate));
    if (activeDate === reportDate) setFilters(INITIAL_FILTERS);
  }

  const tabRowCounts: Record<TabKey, number> = {
    market: marketRows.length,
    origin: originRows.length,
    airline: airlineRows.length,
    detail: filteredRecords.length,
  };

  const tabRows: Record<TabKey, SummaryRow[]> = {
    market: marketRows,
    origin: originRows,
    airline: airlineRows,
    detail: [],
  };

  const TAB_LABELS: Record<TabKey, string> = {
    market: "Theo điểm liên quan",
    origin: "Theo điểm khởi hành",
    airline: "Theo hãng",
    detail: "Chi tiết leg bay",
  };

  return (
    <main className="app-shell">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-icon">
            <Plane size={22} />
          </div>
          <div>
            <div className="eyebrow">
              DAD Flight Operations
              <span className="eyebrow-badge">LIVE</span>
            </div>
            <h1>Quản lý và thống kê phục vụ chuyến bay</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <LiveClock />
          <label className="upload-button">
            <Upload size={16} aria-hidden />
            <span>{importing ? "Đang đọc file..." : "Upload Excel"}</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={importing}
              onChange={(e) => {
                void handleUpload(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </header>

      {/* MAIN GRID */}
      <section className="workspace-grid">
        {/* SIDEBAR */}
        <aside className="side-panel">
          {/* Airport Badge */}
          <div className="airport-badge">
            <div className="airport-code">DAD</div>
            <div>
              <div className="airport-name" style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Cảng HKQT Đà Nẵng</div>
              <div className="airport-name">Da Nang International Airport</div>
            </div>
          </div>

          <div className="panel-title">
            <Database size={14} aria-hidden />
            <span>Dữ liệu theo ngày</span>
            {datasets.length > 0 && (
              <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.72rem" }}>
                {datasets.length} file
              </span>
            )}
          </div>

          {datasets.length ? (
            <div className="dataset-list">
              {datasets.map((dataset) => (
                <button
                  className={`dataset-item ${dataset.reportDate === activeDataset?.reportDate ? "active" : ""}`}
                  key={dataset.reportDate}
                  onClick={() => setActiveDate(dataset.reportDate)}
                  type="button"
                >
                  <span>
                    <strong>{formatDate(dataset.reportDate)}</strong>
                    <small>{formatNumber(dataset.legCount)} leg · {formatNumber(dataset.sourceFlightRows)} dòng</small>
                  </span>
                  <Trash2
                    size={14}
                    className="delete-btn"
                    aria-label={`Xóa ${formatDate(dataset.reportDate)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDataset(dataset.reportDate);
                    }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Plane size={28} aria-hidden />
              <p>Chưa có dữ liệu. Upload file Excel báo cáo để bắt đầu.</p>
            </div>
          )}

          {message && <div className="message">{message}</div>}
          {activeDataset?.warnings.length ? (
            <div className="warning-box">
              <strong>⚠ Cảnh báo parse</strong>
              {activeDataset.warnings.slice(0, 4).map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          ) : null}
        </aside>

        {/* CONTENT */}
        <section className="content-panel">
          {activeDataset ? (
            <>
              {/* REPORT HEAD */}
              <div className="report-head">
                <div>
                  <div className="report-date">
                    <CalendarDays size={16} aria-hidden />
                    <span>{formatDate(activeDataset.reportDate)}</span>
                  </div>
                  <h2>{activeDataset.meta.airportName}</h2>
                  <p>{activeDataset.meta.dateRangeText || activeDataset.fileName}</p>
                </div>
                <div className="report-meta">
                  <span>📄 {activeDataset.fileName}</span>
                  <span>Nhập lúc: {new Date(activeDataset.importedAt).toLocaleString("vi-VN")}</span>
                </div>
              </div>

              {/* FILTERS */}
              <section className="filter-panel">
                <div className="filter-header">
                  <div className="panel-title" style={{ marginBottom: 0 }}>
                    <Filter size={14} aria-hidden />
                    <span>Bộ lọc</span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      className="filter-clear-btn"
                      type="button"
                      onClick={() => setFilters(INITIAL_FILTERS)}
                    >
                      <X size={10} style={{ display: "inline", marginRight: 3 }} />
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
                <div className="filters-grid">
                  <label>
                    Chiều bay
                    <select value={filters.direction} onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value as DashboardFilters["direction"] }))}>
                      <option value="all">Đi và đến</option>
                      <option value="departure">Chỉ đi từ DAD</option>
                      <option value="arrival">Chỉ đến DAD</option>
                    </select>
                  </label>
                  <label>
                    Điểm khởi hành
                    <select value={filters.origin} onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}>
                      <option value="">Tất cả</option>
                      {originOptions.map((code) => (
                        <option key={code} value={code}>{formatAirport(code)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quốc gia
                    <select value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value, province: "" }))}>
                      <option value="">Tất cả</option>
                      {countryOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tỉnh/TP
                    <select value={filters.province} onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}>
                      <option value="">Tất cả</option>
                      {provinceOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label className="search-field">
                    Tìm kiếm
                    <span>
                      <Search size={14} aria-hidden />
                      <input
                        value={filters.search}
                        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                        placeholder="Số hiệu, hãng, chặng bay..."
                      />
                    </span>
                  </label>
                </div>

                {/* Active filter chips */}
                {hasActiveFilters && (
                  <div className="active-filters">
                    {filters.direction !== "all" && (
                      <span className="filter-chip">
                        {filters.direction === "departure" ? "↑ Chỉ đi" : "↓ Chỉ đến"}
                      </span>
                    )}
                    {filters.origin && <span className="filter-chip">Từ: {filters.origin}</span>}
                    {filters.country && <span className="filter-chip">{filters.country}</span>}
                    {filters.province && <span className="filter-chip">{filters.province}</span>}
                    {filters.search && <span className="filter-chip">🔍 "{filters.search}"</span>}
                  </div>
                )}
              </section>

              {/* SCORE CARDS */}
              <section className="score-grid">
                <ScoreCard
                  color="cyan"
                  icon={<Plane size={20} aria-hidden />}
                  label="Chuyến bay chuẩn hóa"
                  value={formatNumber(filteredTotals.legs)}
                  detail={`${formatNumber(filteredTotals.sourceRows)} dòng Excel gốc`}
                />
                <ScoreCard
                  color="blue"
                  icon={<Users size={20} aria-hidden />}
                  label="Tổng khách bay"
                  value={formatNumber(filteredTotals.passengers)}
                  detail={`ADL ${formatNumber(filteredTotals.adults)} · CHD ${formatNumber(filteredTotals.children)} · INF ${formatNumber(filteredTotals.infants)}`}
                />
                <ScoreCard
                  color="purple"
                  icon={<ArrowDownToLine size={20} aria-hidden />}
                  label="Đến DAD"
                  value={formatNumber(filteredTotals.arrivals)}
                  detail={`${formatNumber(filteredTotals.arrivalPassengers)} khách đến`}
                />
                <ScoreCard
                  color="green"
                  icon={<ArrowUpFromLine size={20} aria-hidden />}
                  label="Đi từ DAD"
                  value={formatNumber(filteredTotals.departures)}
                  detail={`${formatNumber(filteredTotals.departurePassengers)} khách đi`}
                />
                <ScoreCard
                  color="gold"
                  icon={<Package size={20} aria-hidden />}
                  label="Khối lượng phục vụ"
                  value={kg(filteredTotals.baggageKg + filteredTotals.parcelKg + filteredTotals.cargoKg)}
                  detail={`Hành lý ${kg(filteredTotals.baggageKg)} · Hàng hóa ${kg(filteredTotals.cargoKg)}`}
                />
                <ScoreCard
                  color="cyan"
                  icon={<MapPinned size={20} aria-hidden />}
                  label="Phạm vi khai thác"
                  value={`${formatNumber(filteredTotals.countryCount)} quốc gia`}
                  detail={`${formatNumber(filteredTotals.airlineCount)} hãng hàng không`}
                />
              </section>

              {/* TABS */}
              <section className="tabs-panel">
                <div className="tabbar">
                  {(["market", "origin", "airline", "detail"] as TabKey[]).map((tab) => (
                    <button
                      key={tab}
                      className={activeTab === tab ? "active" : ""}
                      onClick={() => setActiveTab(tab)}
                      type="button"
                    >
                      {TAB_LABELS[tab]}
                      <span className="tab-count">{formatNumber(tabRowCounts[tab])}</span>
                    </button>
                  ))}
                </div>
                {activeTab === "detail" ? (
                  <DetailTable records={filteredRecords} />
                ) : (
                  <SummaryTable rows={tabRows[activeTab]} maxPassengers={maxPassengers} />
                )}
              </section>
            </>
          ) : (
            <div className="empty-dashboard">
              <Upload size={40} aria-hidden style={{ opacity: 0.25 }} />
              <h2>Upload báo cáo Excel để xem dashboard</h2>
              <p>
                Ứng dụng sẽ tự nhận diện nhóm hãng, tách chặng turnaround thành 2 leg và lưu dữ liệu theo ngày báo cáo.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export { App };
