import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronDown,
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
  buildAirlineOptions,
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
  getAircraftCapacity,
  calculateOccupancy,
} from "./analytics";
import { parseFlightExcel } from "./excelParser";
import { loadDatasets, saveDatasets } from "./storage";
import type { DashboardFilters, FlightDataset, FlightLeg, SummaryRow } from "./types";
import "./styles.css";

const INITIAL_FILTERS: DashboardFilters = {
  direction: "all",
  airline: "",
  origin: "",
  country: "",
  province: "",
  search: "",
  dateFrom: "",
  dateTo: "",
};

type TabKey = "market" | "origin" | "airline" | "detail";

function kg(value: number): string {
  return `${formatNumber(value)} kg`;
}

function transit(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

// Live Clock
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

// Dataset Picker Dropdown (replaces sidebar)
function DatasetPicker({
  datasets,
  activeDate,
  onSelect,
  onRemove,
  importing,
  onUpload,
  message,
}: {
  datasets: FlightDataset[];
  activeDate: string;
  onSelect: (date: string) => void;
  onRemove: (date: string) => void;
  importing: boolean;
  onUpload: (file: File | undefined) => void;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeDataset = datasets.find((d) => d.reportDate === activeDate);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="dataset-picker" ref={ref}>
      <button
        className="dataset-trigger"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarDays size={15} />
        <span>
          {activeDataset ? formatDate(activeDataset.reportDate) : "Chọn ngày báo cáo"}
        </span>
        {datasets.length > 1 && (
          <span className="picker-badge">{datasets.length}</span>
        )}
        <ChevronDown size={14} className={`picker-chevron ${open ? "open" : ""}`} />
      </button>

      {open && (
        <div className="dataset-dropdown">
          <div className="dropdown-header">
            <span>Dữ liệu theo ngày</span>
            <label className="upload-button-sm">
              <Upload size={13} />
              <span>{importing ? "Đang đọc..." : "Upload"}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={importing}
                onChange={(e) => {
                  onUpload(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          {message && (
            <div className={`dropdown-message ${message.startsWith("✕") ? "error" : "success"}`}>
              {message}
            </div>
          )}

          {datasets.length === 0 ? (
            <div className="dropdown-empty">
              <Plane size={20} opacity={0.3} />
              <p>Chưa có dữ liệu</p>
            </div>
          ) : (
            <div className="dropdown-list">
              {datasets.map((dataset) => (
                <button
                  key={dataset.reportDate}
                  className={`dropdown-item ${dataset.reportDate === activeDate ? "active" : ""}`}
                  type="button"
                  onClick={() => { onSelect(dataset.reportDate); setOpen(false); }}
                >
                  <div className="dropdown-item-info">
                    <strong>{formatDate(dataset.reportDate)}</strong>
                    <small>{formatNumber(dataset.legCount)} leg · {formatNumber(dataset.sourceFlightRows)} dòng</small>
                  </div>
                  <Trash2
                    size={13}
                    className="dropdown-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(dataset.reportDate);
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
              <th style={{ width: 36 }}>#</th>
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
                  <td><span className="row-rank">{index + 1}</span></td>
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
              <tr><td colSpan={11} className="empty-cell">Không có dữ liệu phù hợp với bộ lọc.</td></tr>
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
  const flightsWithCapacity = useMemo(() => {
    return records.map(r => {
      const cap = getAircraftCapacity(r.aircraftType);
      return {
        leg: r,
        capacity: cap,
        occupancy: cap ? calculateOccupancy(r.adult, r.child, cap) : null
      };
    });
  }, [records]);

  const overallOccupancy = useMemo(() => {
    const valid = flightsWithCapacity.filter(f => f.capacity !== null);
    const totalSeats = valid.reduce((sum, f) => sum + (f.capacity || 0), 0);
    const totalSeatPassengers = valid.reduce((sum, f) => sum + (f.leg.adult + f.leg.child), 0);
    return totalSeats > 0 ? (totalSeatPassengers / totalSeats) * 100 : null;
  }, [flightsWithCapacity]);

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
              <th className="number">Sức chứa</th>
              <th className="number">Lấp đầy</th>
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
            {flightsWithCapacity.map(({ leg, capacity, occupancy }) => (
              <tr key={leg.id}>
                <td style={{ fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>{formatDate(leg.reportDate)}</td>
                <td style={{ fontWeight: 700, fontSize: "0.85rem" }}>{leg.airline}</td>
                <td>
                  <div className="main-cell">{leg.flightNo}</div>
                  {leg.originalFlightNo !== leg.flightNo && (
                    <div className="muted">Gốc: {leg.originalFlightNo}</div>
                  )}
                </td>
                <td>
                  <div className="main-cell">{leg.route}</div>
                  {leg.originalRoute !== leg.route && (
                    <div className="muted">Từ {leg.originalRoute}</div>
                  )}
                </td>
                <td>
                  <span className={`direction-pill ${leg.direction}`}>
                    {leg.direction === "arrival" ? "↓ Đến DAD" : "↑ Đi từ DAD"}
                  </span>
                </td>
                <td style={{ fontSize: "0.82rem" }}>{leg.aircraftType}</td>
                <td className="number" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                  {capacity ? `${capacity} ghế` : "—"}
                </td>
                <td className="number">
                  {occupancy !== null ? (
                    <span className={`occupancy-badge ${
                      occupancy < 50 ? "low" : occupancy < 75 ? "medium" : occupancy < 90 ? "good" : "high"
                    }`}>
                      {occupancy.toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="number" style={{ fontWeight: 700 }}>{formatNumber(leg.passengerTotal)}</td>
                <td className="number">{formatNumber(leg.adult)}</td>
                <td className="number">{formatNumber(leg.child)}</td>
                <td className="number">{formatNumber(leg.infant)}</td>
                <td className="number">{kg(leg.baggageKg)}</td>
                <td className="number">{kg(leg.parcelKg)}</td>
                <td className="number">{kg(leg.cargoKg)}</td>
                <td className="number">{transit(leg.transitKg)}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>#{leg.sourceRow}</td>
              </tr>
            ))}
            {!records.length && (
              <tr><td colSpan={17} className="empty-cell">Không có leg bay phù hợp với bộ lọc.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {records.length > 0 && (
        <div className="table-footer">
          <span>{formatNumber(records.length)} leg bay</span>
          <span>Tổng khách: {formatNumber(records.reduce((s, r) => s + r.passengerTotal, 0))}</span>
          <span>
            Hệ số lấp đầy TB:{" "}
            {overallOccupancy !== null ? (
              <span className={`occupancy-footer-value ${
                overallOccupancy < 50 ? "low" : overallOccupancy < 75 ? "medium" : overallOccupancy < 90 ? "good" : "high"
              }`}>
                {overallOccupancy.toFixed(1)}%
              </span>
            ) : (
              "—"
            )}
          </span>
        </div>
      )}
    </>
  );
}

function App() {
  const [datasets, setDatasets] = useState<FlightDataset[]>(() => loadDatasets());
  const [activeDate, setActiveDate] = useState(() => loadDatasets()[0]?.reportDate ?? "");
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const all = loadDatasets();
    const dates = all.map((d) => d.reportDate).sort();
    return {
      ...INITIAL_FILTERS,
      dateFrom: dates[0] ?? "",
      dateTo: dates[dates.length - 1] ?? "",
    };
  });
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [isDateFilterExpanded, setIsDateFilterExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { saveDatasets(datasets); }, [datasets]);

  // Keep activeDate in sync (used only for DatasetPicker display)
  useEffect(() => {
    if (!activeDate && datasets[0]) setActiveDate(datasets[0].reportDate);
    if (activeDate && !datasets.some((d) => d.reportDate === activeDate)) {
      setActiveDate(datasets[0]?.reportDate ?? "");
    }
  }, [activeDate, datasets]);

  // All records from all datasets combined
  const allRecords = useMemo(
    () => datasets.flatMap((d) => d.records),
    [datasets],
  );

  // Date bounds derived from loaded datasets
  const dateBounds = useMemo(() => {
    const dates = datasets.map((d) => d.reportDate).sort();
    return { min: dates[0] ?? "", max: dates[dates.length - 1] ?? "" };
  }, [datasets]);

  const filteredRecords = useMemo(() => filterRecords(allRecords, filters), [allRecords, filters]);
  const filteredTotals = useMemo(() => totals(filteredRecords), [filteredRecords]);
  const marketRows = useMemo(() => summarizeByMarket(filteredRecords), [filteredRecords]);
  const originRows = useMemo(() => summarizeByOrigin(filteredRecords), [filteredRecords]);
  const airlineRows = useMemo(() => summarizeByAirline(filteredRecords), [filteredRecords]);
  const maxPassengers = Math.max(0, ...marketRows.map((r) => r.passengers), ...originRows.map((r) => r.passengers), ...airlineRows.map((r) => r.passengers));

  // Filter options built from records within current date range
  const rangeRecords = useMemo(
    () => allRecords.filter((r) =>
      (!filters.dateFrom || r.reportDate >= filters.dateFrom) &&
      (!filters.dateTo || r.reportDate <= filters.dateTo)
    ),
    [allRecords, filters.dateFrom, filters.dateTo],
  );

  const originOptions = useMemo(() => buildAirportOptions(rangeRecords), [rangeRecords]);
  const airlineOptions = useMemo(() => buildAirlineOptions(rangeRecords), [rangeRecords]);
  const countryOptions = useMemo(() => buildCountryOptions(rangeRecords), [rangeRecords]);
  const provinceOptions = useMemo(() => buildProvinceOptions(rangeRecords, filters.country), [rangeRecords, filters.country]);

  useEffect(() => {
    if (filters.province && !provinceOptions.includes(filters.province)) {
      setFilters((f) => ({ ...f, province: "" }));
    }
  }, [filters.province, provinceOptions]);

  // Expand date range when new dataset is added
  useEffect(() => {
    if (!dateBounds.min) return;
    setFilters((f) => ({
      ...f,
      dateFrom: f.dateFrom ? (f.dateFrom < dateBounds.min ? f.dateFrom : dateBounds.min) : dateBounds.min,
      dateTo: f.dateTo ? (f.dateTo > dateBounds.max ? f.dateTo : dateBounds.max) : dateBounds.max,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateBounds.min, dateBounds.max]);

  const hasActiveDateFilter = (filters.dateFrom && filters.dateFrom !== dateBounds.min) ||
    (filters.dateTo && filters.dateTo !== dateBounds.max);
  const hasActiveFilters = hasActiveDateFilter || filters.direction !== "all" || filters.airline || filters.origin || filters.country || filters.province || filters.search;

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
      setMessage(`✓ Nhập ${formatNumber(dataset.sourceFlightRows)} dòng → ${formatNumber(dataset.legCount)} leg (${formatDate(dataset.reportDate)})`);
    } catch (error) {
      setMessage(`✕ ${error instanceof Error ? error.message : "Không thể đọc file Excel."}`);
    } finally {
      setImporting(false);
    }
  }

  function removeDataset(reportDate: string) {
    setDatasets((current) => current.filter((d) => d.reportDate !== reportDate));
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
      {/* ── TOPBAR ── */}
      <header className="topbar">
        {/* Brand */}
        <div className="topbar-brand">
          <div className="brand-icon"><Plane size={20} /></div>
          <div>
            <div className="eyebrow">DAD Flight Operations <span className="eyebrow-badge">LIVE</span></div>
            <h1>Thống kê phục vụ chuyến bay</h1>
          </div>
        </div>

        {/* Dataset Picker — moved from sidebar */}
        <DatasetPicker
          datasets={datasets}
          activeDate={activeDate}
          onSelect={setActiveDate}
          onRemove={removeDataset}
          importing={importing}
          onUpload={handleUpload}
          message={message}
        />

        {/* Right actions */}
        <div className="topbar-actions">
          <LiveClock />
          <label className="upload-button">
            <Upload size={15} aria-hidden />
            <span>{importing ? "Đang đọc..." : "Upload Excel"}</span>
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

      {/* ── FULL-WIDTH CONTENT ── */}
      {datasets.length > 0 ? (
        <div className="content-area">
          {/* Report meta bar */}
          <div className="report-bar">
            <div className="report-bar-left">
              <div className="report-date">
                <CalendarDays size={14} aria-hidden />
                {filters.dateFrom && filters.dateTo && filters.dateFrom !== filters.dateTo ? (
                  <span>Từ {formatDate(filters.dateFrom)} đến {formatDate(filters.dateTo)}</span>
                ) : filters.dateFrom ? (
                  <span>{formatDate(filters.dateFrom)}</span>
                ) : (
                  <span>Tất cả {datasets.length} ngày</span>
                )}
              </div>
              <h2>Cảng Hàng không Quốc tế Đà Nẵng (DAD)</h2>
              <span className="report-subtitle">{datasets.length} file đã tải · {formatNumber(allRecords.length)} leg tổng cộng</span>
            </div>
            <div className="report-meta">
              <span>📅 {datasets.length} ngày báo cáo</span>
              <span>{dateBounds.min && dateBounds.max ? `${formatDate(dateBounds.min)} – ${formatDate(dateBounds.max)}` : ""}</span>
            </div>
          </div>

          {/* Warnings */}
          {datasets.flatMap((d) => d.warnings).length > 0 && (
            <div className="warning-box" style={{ marginBottom: 12 }}>
              <strong>⚠ Cảnh báo parse ({datasets.flatMap((d) => d.warnings).length} mục)</strong>
              {datasets.flatMap((d) => d.warnings).slice(0, 4).map((w) => <p key={w}>{w}</p>)}
            </div>
          )}

          {/* FILTERS */}
          <section className="filter-panel">
            <div className="filter-header">
              <div className="panel-title" style={{ marginBottom: 0 }}>
                <Filter size={13} />
                <span>Bộ lọc</span>
              </div>
              {hasActiveFilters && (
                <button className="filter-clear-btn" type="button" onClick={() => setFilters((f) => ({ ...INITIAL_FILTERS, dateFrom: dateBounds.min, dateTo: dateBounds.max })) }>
                  <X size={10} style={{ display: "inline", marginRight: 3 }} />
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {/* Bộ lọc Từ ngày - Đến ngày nổi bật & thu gọn */}
            <div className={`date-filter-card ${hasActiveDateFilter ? "is-active" : ""}`}>
              <div 
                className="date-filter-header"
                onClick={() => setIsDateFilterExpanded(!isDateFilterExpanded)}
              >
                <div className="date-filter-left">
                  <div className={`date-filter-icon ${hasActiveDateFilter ? "active" : ""}`}>
                    <CalendarDays size={16} />
                  </div>
                  <div>
                    <div className="date-filter-label">Bộ lọc thời gian</div>
                    <div className="date-filter-value">
                      {filters.dateFrom && filters.dateTo ? (
                        filters.dateFrom === filters.dateTo ? (
                          <span className="highlight-date">{formatDate(filters.dateFrom)}</span>
                        ) : (
                          <>
                            Từ <span className="highlight-date">{formatDate(filters.dateFrom)}</span> đến <span className="highlight-date">{formatDate(filters.dateTo)}</span>
                          </>
                        )
                      ) : (
                        "Tất cả thời gian"
                      )}
                    </div>
                  </div>
                </div>
                <div className="date-filter-right">
                  {hasActiveDateFilter && (
                    <span className="date-filter-badge">Đang lọc</span>
                  )}
                  <div className={`date-filter-chevron ${isDateFilterExpanded ? "expanded" : ""}`}>
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              {isDateFilterExpanded && (
                <div className="date-filter-body">
                  <div className="date-filter-inputs">
                    <label>
                      Từ ngày
                      <input
                        type="date"
                        value={filters.dateFrom}
                        min={dateBounds.min}
                        max={filters.dateTo || dateBounds.max}
                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      />
                    </label>
                    <span className="date-range-sep">—</span>
                    <label>
                      Đến ngày
                      <input
                        type="date"
                        value={filters.dateTo}
                        min={filters.dateFrom || dateBounds.min}
                        max={dateBounds.max}
                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="date-filter-presets">
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => {
                        setFilters((f) => ({ ...f, dateFrom: dateBounds.min, dateTo: dateBounds.max }));
                      }}
                      disabled={!hasActiveDateFilter}
                    >
                      Mặc định (Toàn bộ)
                    </button>
                    {dateBounds.max && (
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => {
                          setFilters((f) => ({ ...f, dateFrom: dateBounds.max, dateTo: dateBounds.max }));
                        }}
                        disabled={filters.dateFrom === dateBounds.max && filters.dateTo === dateBounds.max}
                      >
                        Ngày mới nhất
                      </button>
                    )}
                  </div>
                </div>
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
                Hãng hàng không
                <select value={filters.airline} onChange={(e) => setFilters((f) => ({ ...f, airline: e.target.value }))}>
                  <option value="">Tất cả</option>
                  {airlineOptions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
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
                  {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label>
                Tỉnh/TP
                <select value={filters.province} onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}>
                  <option value="">Tất cả</option>
                  {provinceOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="search-field">
                Tìm kiếm
                <span>
                  <Search size={13} aria-hidden />
                  <input
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    placeholder="Số hiệu, hãng, chặng bay..."
                  />
                </span>
              </label>
            </div>
            {hasActiveFilters && (
              <div className="active-filters">
                {hasActiveDateFilter && (
                  <span className="filter-chip">
                    📅 {filters.dateFrom ? formatDate(filters.dateFrom) : "?"}{filters.dateFrom !== filters.dateTo ? ` – ${filters.dateTo ? formatDate(filters.dateTo) : "?"}` : ""}
                  </span>
                )}
                {filters.direction !== "all" && <span className="filter-chip">{filters.direction === "departure" ? "↑ Chỉ đi" : "↓ Chỉ đến"}</span>}
                {filters.airline && <span className="filter-chip">✈ {filters.airline}</span>}
                {filters.origin && <span className="filter-chip">Từ: {filters.origin}</span>}
                {filters.country && <span className="filter-chip">{filters.country}</span>}
                {filters.province && <span className="filter-chip">{filters.province}</span>}
                {filters.search && <span className="filter-chip">🔍 "{filters.search}"</span>}
              </div>
            )}
          </section>

          {/* SCORE CARDS */}
          <section className="score-grid">
            <ScoreCard color="cyan" icon={<Plane size={19} />} label="Chuyến bay chuẩn hóa" value={formatNumber(filteredTotals.legs)} detail={`${formatNumber(filteredTotals.sourceRows)} dòng Excel gốc`} />
            <ScoreCard color="blue" icon={<Users size={19} />} label="Tổng khách bay" value={formatNumber(filteredTotals.passengers)} detail={`ADL ${formatNumber(filteredTotals.adults)} · CHD ${formatNumber(filteredTotals.children)} · INF ${formatNumber(filteredTotals.infants)}`} />
            <ScoreCard color="purple" icon={<ArrowDownToLine size={19} />} label="Đến DAD" value={formatNumber(filteredTotals.arrivals)} detail={`${formatNumber(filteredTotals.arrivalPassengers)} khách đến`} />
            <ScoreCard color="green" icon={<ArrowUpFromLine size={19} />} label="Đi từ DAD" value={formatNumber(filteredTotals.departures)} detail={`${formatNumber(filteredTotals.departurePassengers)} khách đi`} />
            <ScoreCard color="gold" icon={<Package size={19} />} label="Khối lượng phục vụ" value={kg(filteredTotals.baggageKg + filteredTotals.parcelKg + filteredTotals.cargoKg)} detail={`Hành lý ${kg(filteredTotals.baggageKg)} · Hàng hóa ${kg(filteredTotals.cargoKg)}`} />
            <ScoreCard color="cyan" icon={<MapPinned size={19} />} label="Phạm vi khai thác" value={`${formatNumber(filteredTotals.countryCount)} quốc gia`} detail={`${formatNumber(filteredTotals.airlineCount)} hãng hàng không`} />
          </section>

          {/* TABS + TABLE */}
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
        </div>
      ) : (
        <div className="empty-dashboard">
          <Upload size={40} aria-hidden style={{ opacity: 0.2 }} />
          <h2>Upload báo cáo Excel để xem dashboard</h2>
          <p>Ứng dụng sẽ tự nhận diện nhóm hãng, tách chặng turnaround thành 2 leg và lưu dữ liệu theo ngày báo cáo. Có thể upload nhiều file để xem tổng hợp nhiều ngày.</p>
          <label className="upload-button" style={{ marginTop: 8 }}>
            <Upload size={15} />
            <span>Chọn file Excel</span>
            <input type="file" accept=".xlsx,.xls" disabled={importing} onChange={(e) => { void handleUpload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
        </div>
      )}
    </main>
  );
}

export { App };
