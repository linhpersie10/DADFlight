import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronDown,
  Database,
  Filter,
  MapPinned,
  Package,
  Percent,
  Plane,
  Search,
  Trash2,
  Upload,
  Users,
  X,
  LogOut,
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
import { saveDatasetToCloud, deleteDatasetFromCloud, fetchDatasetLegs } from "./storage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Toaster, toast } from "react-hot-toast";
import Login from "./components/Login";
import PendingApproval from "./components/PendingApproval";
import PinVerification from "./components/PinVerification";
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

function DashboardContent() {
  const { logout, profile } = useAuth();
  const [datasets, setDatasets] = useState<FlightDataset[]>([]);
  const [activeDate, setActiveDate] = useState<string>("");
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS);
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [isDateFilterExpanded, setIsDateFilterExpanded] = useState(false);
  const [isFilterPanelExpanded, setIsFilterPanelExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Listen to Firestore datasets metadata list
  useEffect(() => {
    const q = query(collection(db, "PKT_DAD_datasets"), orderBy("reportDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const metaList = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          reportDate: data.reportDate,
          fileName: data.fileName,
          importedAt: data.importedAt,
          meta: data.meta,
          sourceFlightRows: data.sourceFlightRows,
          legCount: data.legCount,
          warnings: data.warnings || [],
          records: []
        } as FlightDataset;
      });

      setDatasets(current => {
        return metaList.map(meta => {
          const match = current.find(c => c.id === meta.id && c.records.length > 0);
          return match ? { ...meta, records: match.records } : meta;
        });
      });
      setLoadingDatasets(false);
    }, (error) => {
      console.error("[Firestore] Datasets listen failed:", error);
      setLoadingDatasets(false);
    });

    return () => unsubscribe();
  }, []);

  // Load missing legs for datasets reactively
  useEffect(() => {
    datasets.forEach(d => {
      if (d.records.length === 0) {
        fetchDatasetLegs(d.id).then(legs => {
          setDatasets(current => 
            current.map(item => 
              item.id === d.id ? { ...item, records: legs } : item
            )
          );
        }).catch(err => {
          console.error(`[Firestore] Failed to fetch legs for dataset ${d.id}:`, err);
        });
      }
    });
  }, [datasets]);

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

  const overallOccupancy = useMemo(() => {
    let totalSeats = 0;
    let totalSeatPassengers = 0;
    let flightsWithCapCount = 0;

    for (const r of filteredRecords) {
      const cap = getAircraftCapacity(r.aircraftType);
      if (cap !== null) {
        totalSeats += cap;
        totalSeatPassengers += (r.adult + r.child);
        flightsWithCapCount++;
      }
    }
    return {
      rate: totalSeats > 0 ? (totalSeatPassengers / totalSeats) * 100 : null,
      flightsWithCapCount,
      totalFlights: filteredRecords.length
    };
  }, [filteredRecords]);

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
      setMessage("Đang đọc và phân tích file Excel...");
      const dataset = await parseFlightExcel(file);
      
      setMessage("Đang tải dữ liệu lên Firestore...");
      await saveDatasetToCloud(dataset);
      
      setActiveDate(dataset.reportDate);
      setMessage(`✓ Nhập ${formatNumber(dataset.sourceFlightRows)} dòng → ${formatNumber(dataset.legCount)} leg (${formatDate(dataset.reportDate)})`);
      toast.success(`Tải báo cáo ngày ${formatDate(dataset.reportDate)} lên Firestore thành công!`);
    } catch (error) {
      setMessage(`✕ ${error instanceof Error ? error.message : "Không thể đọc file Excel."}`);
      toast.error('Lỗi khi tải báo cáo lên cloud.');
    } finally {
      setImporting(false);
    }
  }

  async function removeDataset(reportDate: string) {
    const target = datasets.find(d => d.reportDate === reportDate);
    if (!target) return;

    if (!window.confirm(`Bạn có chắc chắn muốn xóa dữ liệu ngày ${formatDate(reportDate)} khỏi Firestore?`)) {
      return;
    }

    try {
      toast.loading('Đang xóa dữ liệu khỏi Firestore...', { id: 'delete-dataset' });
      await deleteDatasetFromCloud(target.id);
      toast.success('Xóa dữ liệu thành công!', { id: 'delete-dataset' });
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi xóa báo cáo.', { id: 'delete-dataset' });
    }
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

  if (loadingDatasets) {
    return (
      <div className="auth-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <main className="app-shell">
      {/* ── STICKY CONTROL CENTER (TOPBAR, META BAR, FILTERS, SCORE CARDS) ── */}
      <div className={`sticky-header-container ${isScrolled ? "is-scrolled" : ""}`}>
        {/* ── TOPBAR ── */}
        <header className="topbar">
          {/* Brand */}
          <div className="topbar-brand">
            <div className="brand-icon"><Plane size={20} /></div>
            <div>
              <div className="eyebrow">DAD Flight Operations <span className="eyebrow-badge">LIVE</span></div>
              <h1>Thống kê phục vụ chuyến bay</h1>
              {datasets.length > 0 && (
                <div className="topbar-meta">
                  <span className="topbar-meta-item">
                    <MapPinned size={12} />
                    Cảng Hàng không Quốc tế Đà Nẵng (DAD)
                  </span>
                  <span className="topbar-meta-sep" />
                  <span className="topbar-meta-item highlight">
                    <CalendarDays size={12} />
                    {filters.dateFrom && filters.dateTo && filters.dateFrom !== filters.dateTo ? (
                      <span>Từ {formatDate(filters.dateFrom)} đến {formatDate(filters.dateTo)}</span>
                    ) : filters.dateFrom ? (
                      <span>{formatDate(filters.dateFrom)}</span>
                    ) : (
                      <span>Tất cả {datasets.length} ngày</span>
                    )}
                  </span>
                  <span className="topbar-meta-sep" />
                  <span className="topbar-meta-item">
                    <Database size={12} />
                    {datasets.length} ngày ({formatNumber(allRecords.length)} leg)
                  </span>
                </div>
              )}
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

            {/* Profile Avatar & Sign Out */}
            {profile && (
              <div className="topbar-profile" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                borderLeft: '1px solid var(--border-subtle)', 
                paddingLeft: '16px', 
                marginLeft: '16px' 
              }}>
                <img 
                  src={profile.photoURL} 
                  alt={profile.displayName} 
                  referrerPolicy="no-referrer"
                  style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-accent)' }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {profile.displayName}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', textTransform: 'capitalize' }}>
                    {profile.role === 'superadmin' ? 'Super Admin' : profile.role === 'admin' ? 'Admin' : 'Thành viên'}
                  </span>
                </div>
                <button 
                  onClick={logout} 
                  title="Đăng xuất" 
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: 'var(--text-secondary)', 
                    cursor: 'pointer', 
                    padding: '6px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    borderRadius: '4px', 
                    marginLeft: '4px',
                    transition: 'all 0.2s' 
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </header>

        {datasets.length > 0 && (
          <>

            {/* FILTERS */}
            <section className={`filter-panel ${isFilterPanelExpanded ? "is-expanded" : "is-collapsed"} ${hasActiveFilters ? "has-active-filters" : ""}`}>
              <div 
                className="filter-header"
                onClick={() => setIsFilterPanelExpanded(!isFilterPanelExpanded)}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <div className="panel-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <Filter size={13} />
                  <span>Bộ lọc</span>
                  {!isFilterPanelExpanded && (
                    <span className="collapsed-filter-summary">
                      {hasActiveFilters ? "(Đang áp dụng bộ lọc - Click để mở rộng)" : "(Mặc định - Click để mở rộng)"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {hasActiveFilters && (
                    <button 
                      className="filter-clear-btn" 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilters((f) => ({ ...INITIAL_FILTERS, dateFrom: dateBounds.min, dateTo: dateBounds.max }));
                      }}
                    >
                      <X size={10} style={{ display: "inline", marginRight: 3 }} />
                      Xóa bộ lọc
                    </button>
                  )}
                  <div className={`filter-panel-chevron ${isFilterPanelExpanded ? "expanded" : ""}`} style={{ display: "flex", alignItems: "center", transition: "transform 0.2s" }}>
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>

              {isFilterPanelExpanded && (
                <div className="filter-panel-body" style={{ marginTop: "14px" }}>
                  {/* Bộ lọc Từ ngày - Đến ngày nổi bật & thu gọn */}
                  <div className={`date-filter-card ${hasActiveDateFilter ? "is-active" : ""}`}>
                    <div 
                      className="date-filter-header"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDateFilterExpanded(!isDateFilterExpanded);
                      }}
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
                    <label onClick={(e) => e.stopPropagation()}>
                      Chiều bay
                      <select value={filters.direction} onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value as DashboardFilters["direction"] }))}>
                        <option value="all">Đi và đến</option>
                        <option value="departure">Chỉ đi từ DAD</option>
                        <option value="arrival">Chỉ đến DAD</option>
                      </select>
                    </label>
                    <label onClick={(e) => e.stopPropagation()}>
                      Hãng hàng không
                      <select value={filters.airline} onChange={(e) => setFilters((f) => ({ ...f, airline: e.target.value }))}>
                        <option value="">Tất cả</option>
                        {airlineOptions.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </label>
                    <label onClick={(e) => e.stopPropagation()}>
                      Điểm khởi hành
                      <select value={filters.origin} onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}>
                        <option value="">Tất cả</option>
                        {originOptions.map((code) => (
                          <option key={code} value={code}>{formatAirport(code)}</option>
                        ))}
                      </select>
                    </label>
                    <label onClick={(e) => e.stopPropagation()}>
                      Quốc gia
                      <select value={filters.country} onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value, province: "" }))}>
                        <option value="">Tất cả</option>
                        {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label onClick={(e) => e.stopPropagation()}>
                      Tỉnh/TP
                      <select value={filters.province} onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}>
                        <option value="">Tất cả</option>
                        {provinceOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <label className="search-field" onClick={(e) => e.stopPropagation()}>
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
                </div>
              )}

              {hasActiveFilters && (
                <div className="active-filters" style={{ marginTop: isFilterPanelExpanded ? "12px" : "8px" }}>
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
              <ScoreCard color="gold" icon={<Percent size={19} />} label="Tỷ lệ lấp đầy" value={overallOccupancy.rate !== null ? `${overallOccupancy.rate.toFixed(1)}%` : "—"} detail={`Tính trên ${overallOccupancy.flightsWithCapCount}/${overallOccupancy.totalFlights} leg bay có cấu hình`} />
              <ScoreCard color="cyan" icon={<MapPinned size={19} />} label="Phạm vi khai thác" value={`${formatNumber(filteredTotals.countryCount)} quốc gia`} detail={`${formatNumber(filteredTotals.airlineCount)} hãng hàng không`} />
            </section>
          </>
        )}
      </div>

      {/* ── CONTENT AREA (SCROLLABLE) ── */}
      {datasets.length > 0 ? (
        <div className="content-area">
          {/* Warnings */}
          {datasets.flatMap((d) => d.warnings).length > 0 && (
            <div className="warning-box" style={{ marginBottom: 12 }}>
              <strong>⚠ Cảnh báo parse ({datasets.flatMap((d) => d.warnings).length} mục)</strong>
              {datasets.flatMap((d) => d.warnings).slice(0, 4).map((w) => <p key={w}>{w}</p>)}
            </div>
          )}

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

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isPinVerified } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (profile?.status !== 'approved') {
    return <PendingApproval />;
  }

  if (!isPinVerified) {
    return <PinVerification />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#162040',
            color: '#f1f5f9',
            border: '1px solid rgba(0, 212, 255, 0.15)'
          }
        }} 
      />
      <AuthGuard>
        <DashboardContent />
      </AuthGuard>
    </AuthProvider>
  );
}

export { App };
