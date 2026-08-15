import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  Filter,
  Globe,
  MapPinned,
  Package,
  Percent,
  Plane,
  RotateCcw,
  Search,
  SlidersHorizontal,
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
import { getCache, setCache, deleteCache } from "./dbCache";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { loadDynamicAirports, autoDiscoverAirports } from "./airportService";
import { isAirportUnknown } from "./airportReference";
import { Toaster, toast } from "react-hot-toast";
import Login from "./components/Login";
import PendingApproval from "./components/PendingApproval";
import PinVerification from "./components/PinVerification";
import UserManagement from "./components/UserManagement";
import LeaderboardPanel from "./components/LeaderboardPanel";
import type { DashboardFilters, FlightDataset, FlightLeg, SummaryRow } from "./types";
import "./styles.css";
import { toPng } from 'html-to-image';

const INITIAL_FILTERS: DashboardFilters = {
  direction: "all",
  airline: "",
  origin: "",
  country: "",
  province: "",
  search: "",
  dateFrom: "",
  dateTo: "",
  flightScope: "all",
};

type TabKey = "market" | "origin" | "airline" | "detail" | "leaderboard";

function getDefaultDateRange(datasets: FlightDataset[]) {
  if (datasets.length === 0) return { dateFrom: "", dateTo: "" };
  const uniqueDates = Array.from(new Set(datasets.map(d => d.reportDate))).sort((a, b) => b.localeCompare(a));
  const dateTo = uniqueDates[0] || "";
  const targetIndex = Math.min(6, uniqueDates.length - 1);
  const dateFrom = uniqueDates[targetIndex] || "";
  return { dateFrom, dateTo };
}

function kg(value: number): string {
  return formatNumber(value);
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

function FilterInputs({
  filters,
  setFilters,
  dateBounds,
  airlineOptions,
  originOptions,
  countryOptions,
  provinceOptions,
  formatAirport,
}: {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  dateBounds: { min?: string; max?: string };
  airlineOptions: string[];
  originOptions: string[];
  countryOptions: string[];
  provinceOptions: string[];
  formatAirport: (code: string) => string;
}) {
  return (
    <div className="filters-grid">
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
      <label onClick={(e) => e.stopPropagation()}>
        Chiều bay
        <select
          value={filters.direction}
          onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value as DashboardFilters["direction"] }))}
        >
          <option value="all">Đi và đến</option>
          <option value="departure">Chỉ đi từ DAD</option>
          <option value="arrival">Chỉ đến DAD</option>
        </select>
      </label>
      <label onClick={(e) => e.stopPropagation()}>
        Tuyến bay
        <select
          value={filters.flightScope}
          onChange={(e) => setFilters((f) => ({ ...f, flightScope: e.target.value as DashboardFilters["flightScope"] }))}
        >
          <option value="all">Tất cả</option>
          <option value="domestic">Nội địa</option>
          <option value="international">Quốc tế</option>
        </select>
      </label>
      <label onClick={(e) => e.stopPropagation()}>
        Hãng hàng không
        <select
          value={filters.airline}
          onChange={(e) => setFilters((f) => ({ ...f, airline: e.target.value }))}
        >
          <option value="">Tất cả</option>
          {airlineOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      <label onClick={(e) => e.stopPropagation()}>
        Điểm khởi hành
        <select
          value={filters.origin}
          onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
        >
          <option value="">Tất cả</option>
          {originOptions.map((code) => (
            <option key={code} value={code}>{formatAirport(code)}</option>
          ))}
        </select>
      </label>
      <label onClick={(e) => e.stopPropagation()}>
        Quốc gia
        <select
          value={filters.country}
          onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value, province: "" }))}>
          <option value="">Tất cả</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label onClick={(e) => e.stopPropagation()}>
        Tỉnh/TP
        <select
          value={filters.province}
          onChange={(e) => setFilters((f) => ({ ...f, province: e.target.value }))}>
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
  );
}

function ActiveFilterChips({
  filters,
  hasActiveDateFilter,
  onOpenFilter,
}: {
  filters: DashboardFilters;
  hasActiveDateFilter: boolean;
  onOpenFilter?: () => void;
}) {
  return (
    <div className="active-filters">
      {hasActiveDateFilter && (
        <span className="filter-chip" onClick={onOpenFilter}>
          📅 {filters.dateFrom ? formatDate(filters.dateFrom) : "?"}
          {filters.dateFrom !== filters.dateTo ? ` – ${filters.dateTo ? formatDate(filters.dateTo) : "?"}` : ""}
        </span>
      )}
      {filters.direction !== "all" && (
        <span className="filter-chip" onClick={onOpenFilter}>
          {filters.direction === "departure" ? "↑ Chỉ đi" : "↓ Chỉ đến"}
        </span>
      )}
      {filters.flightScope !== "all" && (
        <span className="filter-chip" onClick={onOpenFilter}>
          🌐 {filters.flightScope === "domestic" ? "Nội địa" : "Quốc tế"}
        </span>
      )}
      {filters.airline && (
        <span className="filter-chip" onClick={onOpenFilter}>
          ✈ {filters.airline}
        </span>
      )}
      {filters.origin && (
        <span className="filter-chip" onClick={onOpenFilter}>
          Từ: {filters.origin}
        </span>
      )}
      {filters.country && (
        <span className="filter-chip" onClick={onOpenFilter}>
          🌍 {filters.country}
        </span>
      )}
      {filters.province && (
        <span className="filter-chip" onClick={onOpenFilter}>
          📍 {filters.province}
        </span>
      )}
      {filters.search && (
        <span className="filter-chip" onClick={onOpenFilter}>
          🔍 "{filters.search}"
        </span>
      )}
    </div>
  );
}

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
      <div className="score-content" style={{ minWidth: 0 }}>
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
              <th className="number">Chuyến<span className="unit">(chuyến)</span></th>
              <th className="number">Đến<span className="unit">(chuyến)</span></th>
              <th className="number">Đi<span className="unit">(chuyến)</span></th>
              <th className="number">Khách<span className="unit">(lượt)</span></th>
              <th className="number">Hành lý<span className="unit">(kg)</span></th>
              <th className="number">Bưu kiện<span className="unit">(kg)</span></th>
              <th className="number">Hàng hóa<span className="unit">(kg)</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const width = maxPassengers ? Math.max(4, Math.round((row.passengers / maxPassengers) * 100)) : 0;
              return (
                <tr key={row.key} className="mobile-card-row">
                  <td data-label="#"><span className="row-rank">{index + 1}</span></td>
                  <td data-label="Điểm">
                    <div className="main-cell">{row.label}</div>
                    <div className="muted">{row.subLabel}</div>
                  </td>
                  <td data-label="Quốc gia" style={{ fontSize: "0.82rem" }}>{row.country || "—"}</td>
                  <td data-label="Tỉnh/TP" style={{ fontSize: "0.82rem" }}>{row.province || "—"}</td>
                  <td data-label="Chuyến" className="number">{formatNumber(row.flightCount)}</td>
                  <td data-label="Đến" className="number">{formatNumber(row.arrivals)}</td>
                  <td data-label="Đi" className="number">{formatNumber(row.departures)}</td>
                  <td data-label="Khách" className="number with-bar">
                    <span style={{ fontWeight: 700 }}>{formatNumber(row.passengers)}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${width}%` }} />
                    </span>
                  </td>
                  <td data-label="Hành lý" className="number">{kg(row.baggageKg)}</td>
                  <td data-label="Bưu kiện" className="number">{kg(row.parcelKg)}</td>
                  <td data-label="Hàng hóa" className="number">{kg(row.cargoKg)}</td>
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
              <th className="number">Sức chứa<span className="unit">(ghế)</span></th>
              <th className="number">Lấp đầy<span className="unit">(%)</span></th>
              <th className="number">Khách<span className="unit">(lượt)</span></th>
              <th className="number">ADL<span className="unit">(lượt)</span></th>
              <th className="number">CHD<span className="unit">(lượt)</span></th>
              <th className="number">INF<span className="unit">(lượt)</span></th>
              <th className="number">Hành lý<span className="unit">(kg)</span></th>
              <th className="number">Bưu kiện<span className="unit">(kg)</span></th>
              <th className="number">Hàng hóa<span className="unit">(kg)</span></th>
              <th className="number">Transit<span className="unit">(kg)</span></th>
              <th>Dòng gốc</th>
            </tr>
          </thead>
          <tbody>
            {flightsWithCapacity.map(({ leg, capacity, occupancy }) => (
              <tr key={leg.id} className="mobile-card-row">
                <td data-label="Ngày" style={{ fontSize: "0.8rem", fontVariantNumeric: "tabular-nums" }}>{formatDate(leg.reportDate)}</td>
                <td data-label="Hãng" style={{ fontWeight: 700, fontSize: "0.85rem" }}>{leg.airline}</td>
                <td data-label="Số hiệu">
                  <div className="main-cell">{leg.flightNo}</div>
                  {leg.originalFlightNo !== leg.flightNo && (
                    <div className="muted">Gốc: {leg.originalFlightNo}</div>
                  )}
                </td>
                <td data-label="Chặng leg">
                  <div className="main-cell">{leg.route}</div>
                  {leg.originalRoute !== leg.route && (
                    <div className="muted">Từ {leg.originalRoute}</div>
                  )}
                </td>
                <td data-label="Chiều">
                  <span className={`direction-pill ${leg.direction}`}>
                    {leg.direction === "arrival" ? "↓ Đến DAD" : "↑ Đi từ DAD"}
                  </span>
                </td>
                <td data-label="Loại MB" style={{ fontSize: "0.82rem" }}>{leg.aircraftType}</td>
                <td data-label="Sức chứa" className="number" style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                  {capacity ? formatNumber(capacity) : "—"}
                </td>
                <td data-label="Lấp đầy" className="number">
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
                <td data-label="Khách" className="number" style={{ fontWeight: 700 }}>{formatNumber(leg.passengerTotal)}</td>
                <td data-label="ADL" className="number">{formatNumber(leg.adult)}</td>
                <td data-label="CHD" className="number">{formatNumber(leg.child)}</td>
                <td data-label="INF" className="number">{formatNumber(leg.infant)}</td>
                <td data-label="Hành lý" className="number">{kg(leg.baggageKg)}</td>
                <td data-label="Bưu kiện" className="number">{kg(leg.parcelKg)}</td>
                <td data-label="Hàng hóa" className="number">{kg(leg.cargoKg)}</td>
                <td data-label="Transit" className="number">{transit(leg.transitKg)}</td>
                <td data-label="Dòng gốc" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>#{leg.sourceRow}</td>
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
  const auth = useAuth();
  const logout = auth.logout;
  const profile = auth.profile || (window.location.hostname === "localhost" ? {
    displayName: "Local Admin",
    photoURL: "https://lh3.googleusercontent.com/a/default-user",
    role: "superadmin",
    status: "approved"
  } : null);
  const [datasets, setDatasets] = useState<FlightDataset[]>([]);
  const [activeDate, setActiveDate] = useState<string>("");
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [viewMode, setViewMode] = useState<"dashboard" | "users">("dashboard");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [airportsVersion, setAirportsVersion] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const fetchingDatasetIds = useRef<Set<string>>(new Set());
  const isInitialFilterSet = useRef(false);
  const knownDatasetIds = useRef<Set<string>>(new Set());
  const headerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      const updateHeaderHeight = () => {
        document.documentElement.style.setProperty(
          "--header-height",
          `${node.offsetHeight}px`
        );
      };
      updateHeaderHeight();
      const observer = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      observer.observe(node);
      observerRef.current = observer;
    }
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
          records: [],
          updatedAt: data.updatedAt || ""
        } as FlightDataset;
      });

      setDatasets(current => {
        return metaList.map(meta => {
          const match = current.find(c => c.id === meta.id);
          if (match && match.records.length > 0 && match.updatedAt === meta.updatedAt) {
            return { ...meta, records: match.records };
          }
          return meta;
        });
      });
      setLoadingDatasets(false);
    }, (error) => {
      console.error("[Firestore] Datasets listen failed:", error);
      setLoadingDatasets(false);
    });

    return () => unsubscribe();
  }, []);

  // Load dynamic airports on mount
  useEffect(() => {
    loadDynamicAirports().then(() => {
      setAirportsVersion(v => v + 1);
    });
  }, []);

  // Load missing legs for datasets reactively with Lazy Loading and IndexedDB Caching
  useEffect(() => {
    datasets.forEach(d => {
      // Lazy load only datasets within the selected date range
      const inRange = (!filters.dateFrom || d.reportDate >= filters.dateFrom) &&
                      (!filters.dateTo || d.reportDate <= filters.dateTo);
      if (!inRange) return;

      if (d.records.length === 0) {
        if (fetchingDatasetIds.current.has(d.id)) return;
        fetchingDatasetIds.current.add(d.id);

        const fetchAndCache = async () => {
          try {
            // Check IndexedDB Cache first
            const cached = await getCache(d.id);
            if (cached && cached.updatedAt === d.updatedAt) {
              setDatasets(current => 
                current.map(item => 
                  item.id === d.id ? { ...item, records: cached.legs } : item
                )
              );
              fetchingDatasetIds.current.delete(d.id);
              return;
            }

            // Cache miss or outdated -> Fetch from Firestore
            const legs = await fetchDatasetLegs(d.id);
            // Save to IndexedDB Cache
            await setCache(d.id, legs, d.updatedAt || "");
            
            setDatasets(current => 
              current.map(item => 
                item.id === d.id ? { ...item, records: legs } : item
              )
            );
          } catch (err) {
            console.error(`[Cache/Firestore] Failed to load legs for dataset ${d.id}:`, err);
          } finally {
            fetchingDatasetIds.current.delete(d.id);
          }
        };

        fetchAndCache();
      }
    });
  }, [datasets, filters.dateFrom, filters.dateTo]);

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

  const filteredRecords = useMemo(() => filterRecords(allRecords, filters), [allRecords, filters, airportsVersion]);
  const filteredTotals = useMemo(() => totals(filteredRecords), [filteredRecords, airportsVersion]);

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

  const marketRows = useMemo(() => summarizeByMarket(filteredRecords), [filteredRecords, airportsVersion]);
  const originRows = useMemo(() => summarizeByOrigin(filteredRecords), [filteredRecords, airportsVersion]);
  const airlineRows = useMemo(() => summarizeByAirline(filteredRecords), [filteredRecords, airportsVersion]);
  const maxPassengers = Math.max(0, ...marketRows.map((r) => r.passengers), ...originRows.map((r) => r.passengers), ...airlineRows.map((r) => r.passengers));

  // Filter options built from records within current date range
  const rangeRecords = useMemo(
    () => allRecords.filter((r) =>
      (!filters.dateFrom || r.reportDate >= filters.dateFrom) &&
      (!filters.dateTo || r.reportDate <= filters.dateTo)
    ),
    [allRecords, filters.dateFrom, filters.dateTo],
  );

  const originOptions = useMemo(() => buildAirportOptions(rangeRecords), [rangeRecords, airportsVersion]);
  const airlineOptions = useMemo(() => buildAirlineOptions(rangeRecords), [rangeRecords, airportsVersion]);
  const countryOptions = useMemo(() => buildCountryOptions(rangeRecords), [rangeRecords, airportsVersion]);
  const provinceOptions = useMemo(() => buildProvinceOptions(rangeRecords, filters.country), [rangeRecords, filters.country, airportsVersion]);

  useEffect(() => {
    if (filters.province && !provinceOptions.includes(filters.province)) {
      setFilters((f) => ({ ...f, province: "" }));
    }
  }, [filters.province, provinceOptions]);

  // Initialize to 7 newest unique reporting days and expand when new datasets are uploaded
  useEffect(() => {
    if (loadingDatasets || datasets.length === 0) return;

    if (!isInitialFilterSet.current) {
      const { dateFrom, dateTo } = getDefaultDateRange(datasets);
      setFilters(f => ({ ...f, dateFrom, dateTo }));
      isInitialFilterSet.current = true;
      knownDatasetIds.current = new Set(datasets.map(d => d.id));
    } else {
      // Sync knownDatasetIds with current datasets list to handle deletions
      const currentIds = new Set(datasets.map(d => d.id));
      for (const id of knownDatasetIds.current) {
        if (!currentIds.has(id)) {
          knownDatasetIds.current.delete(id);
        }
      }

      let addedAny = false;
      let minDate = "";
      let maxDate = "";

      datasets.forEach(d => {
        if (!knownDatasetIds.current.has(d.id)) {
          addedAny = true;
          knownDatasetIds.current.add(d.id);
          if (!minDate || d.reportDate < minDate) minDate = d.reportDate;
          if (!maxDate || d.reportDate > maxDate) maxDate = d.reportDate;
        }
      });

      if (addedAny) {
        setFilters(f => ({
          ...f,
          dateFrom: f.dateFrom ? (minDate && minDate < f.dateFrom ? minDate : f.dateFrom) : minDate,
          dateTo: f.dateTo ? (maxDate && maxDate > f.dateTo ? maxDate : f.dateTo) : maxDate,
        }));
      }
    }
    
    // Auto-discover missing airports for newly loaded records
    if (datasets.length > 0) {
      const allCodes = new Set<string>();
      datasets.forEach(d => {
        d.records.forEach(r => {
          if (r.marketAirport) allCodes.add(r.marketAirport);
          if (r.origin) allCodes.add(r.origin);
          if (r.destination) allCodes.add(r.destination);
        });
      });
      const missing = Array.from(allCodes).filter(code => isAirportUnknown(code));
      if (missing.length > 0) {
        autoDiscoverAirports(missing).then(discovered => {
          if (discovered.length > 0) {
            setAirportsVersion(v => v + 1);
            toast.success(`Đã tự động cập nhật thông tin cho ${discovered.length} sân bay mới.`);
          }
        });
      }
    }
  }, [loadingDatasets, datasets]);

  const defaultDateRange = useMemo(() => getDefaultDateRange(datasets), [datasets]);

  const hasActiveDateFilter = Boolean(
    (filters.dateFrom && filters.dateFrom !== defaultDateRange.dateFrom) ||
    (filters.dateTo && filters.dateTo !== defaultDateRange.dateTo)
  );
  const hasActiveFilters = Boolean(
    hasActiveDateFilter ||
    filters.direction !== "all" ||
    filters.airline ||
    filters.origin ||
    filters.country ||
    filters.province ||
    filters.search ||
    filters.flightScope !== "all"
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (hasActiveDateFilter) count++;
    if (filters.direction !== "all") count++;
    if (filters.flightScope !== "all") count++;
    if (filters.airline) count++;
    if (filters.origin) count++;
    if (filters.country) count++;
    if (filters.province) count++;
    if (filters.search) count++;
    return count;
  }, [hasActiveDateFilter, filters]);

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
      // Expand the date filter to include the uploaded date so data is visible immediately
      setFilters(f => ({
        ...f,
        dateFrom: !f.dateFrom || dataset.reportDate < f.dateFrom ? dataset.reportDate : f.dateFrom,
        dateTo:   !f.dateTo   || dataset.reportDate > f.dateTo   ? dataset.reportDate : f.dateTo,
      }));
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
      await deleteCache(target.id);
      toast.success('Xóa dữ liệu thành công!', { id: 'delete-dataset' });
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi xóa báo cáo.', { id: 'delete-dataset' });
    }
  }

  const handleDownloadImage = async () => {
    const node = document.getElementById('dashboard-export-target');
    if (!node) return;
    
    const toastId = toast.loading("Đang tạo ảnh chất lượng cao...");
    try {
      const dataUrl = await toPng(node, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#080c18',
        width: node.scrollWidth,
        height: node.scrollHeight,
        style: {
          margin: '0',
          transform: 'none',
        }
      });

      const dateStr = filters.dateFrom && filters.dateFrom === filters.dateTo
        ? filters.dateFrom
        : filters.dateFrom && filters.dateTo
          ? `${filters.dateFrom}_to_${filters.dateTo}`
          : activeDate || 'All';

      const fileName = `DADFlight_${activeTab}_${dateStr}.png`;
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
      
      toast.success("Tải ảnh thành công!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tạo ảnh.", { id: toastId });
    }
  };

  const tabRowCounts: Record<TabKey, number> = {
    market: marketRows.length,
    origin: originRows.length,
    airline: airlineRows.length,
    leaderboard: 0,
    detail: filteredRecords.length,
  };

  const tabRows: Record<TabKey, SummaryRow[]> = {
    market: marketRows,
    origin: originRows,
    airline: airlineRows,
    leaderboard: [],
    detail: [],
  };

  const TAB_LABELS: Record<TabKey, string> = {
    market: "Theo điểm liên quan",
    origin: "Theo điểm khởi hành",
    airline: "Theo hãng",
    leaderboard: "Xếp hạng",
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
    <main id="dashboard-export-target" className="app-shell">
      {/* ── STICKY CONTROL CENTER (TOPBAR, META BAR, FILTERS, SCORE CARDS) ── */}
      <div ref={headerRef} className="sticky-header-container">
        {/* ── TOPBAR ── */}
        <header className="topbar">
          {/* Brand */}
          <div className="topbar-brand">
            <div className="brand-icon"><Plane size={18} /></div>
            <div className="brand-info">
              <div className="eyebrow">
                <span>DAD Flight Operations</span>
                <span className="eyebrow-badge">LIVE</span>
              </div>
              {viewMode === "users" ? (
                <h1>Quản trị hệ thống</h1>
              ) : (
                <h1>Thống kê phục vụ chuyến bay</h1>
              )}
              {viewMode === "dashboard" && datasets.length > 0 ? (
                <div className="topbar-meta desktop-only">
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
              ) : viewMode === "users" ? (
                <div className="topbar-meta desktop-only">
                  <span className="topbar-meta-item highlight">
                    <Users size={12} />
                    Cổng quản lý và cấu hình phân quyền người dùng
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Dataset Picker (Desktop only in center) */}
          {viewMode === "dashboard" && (
            <div className="desktop-only">
              <DatasetPicker
                datasets={datasets}
                activeDate={activeDate}
                onSelect={setActiveDate}
                onRemove={removeDataset}
                importing={importing}
                onUpload={handleUpload}
                message={message}
              />
            </div>
          )}

          {/* Right actions */}
          <div className="topbar-actions">
            <div className="desktop-only"><LiveClock /></div>

            {/* User Management Button for Admins */}
            {profile && (profile.role === 'admin' || profile.role === 'superadmin') && (
              <button
                onClick={() => setViewMode(viewMode === 'dashboard' ? 'users' : 'dashboard')}
                className="topbar-btn admin-btn"
                title={viewMode === 'users' ? 'Quay lại Dashboard' : 'Quản trị người dùng'}
              >
                <Users size={15} />
                <span className="desktop-only">{viewMode === 'users' ? 'Dashboard' : 'Users'}</span>
              </button>
            )}

            {viewMode === "dashboard" && activeTab !== "detail" && datasets.length > 0 && (
              <button
                className="topbar-btn download-btn"
                onClick={handleDownloadImage}
                title="Tải ảnh báo cáo"
              >
                <ArrowDownToLine size={15} />
                <span className="desktop-only">Tải ảnh</span>
              </button>
            )}

            {viewMode === "dashboard" && (
              <label className="topbar-btn upload-btn" title="Tải lên file Excel">
                <Upload size={15} aria-hidden />
                <span className="desktop-only">{importing ? "Đang đọc..." : "Upload Excel"}</span>
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
            )}

            {/* Profile Avatar & Sign Out */}
            {profile && (
              <div className="topbar-profile">
                <img 
                  src={profile.photoURL} 
                  alt={profile.displayName} 
                  referrerPolicy="no-referrer"
                  className="user-avatar"
                  title={profile.displayName}
                />
                <div className="user-details desktop-only">
                  <span className="user-name">
                    {profile.displayName}
                  </span>
                  <span className="user-role">
                    {profile.role === 'superadmin' ? 'Super Admin' : profile.role === 'admin' ? 'Admin' : 'Thành viên'}
                  </span>
                </div>
                <button 
                  onClick={logout} 
                  title="Đăng xuất" 
                  className="logout-btn"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </header>

        {viewMode === "dashboard" && datasets.length > 0 && (
          <>
            {/* DESKTOP FILTERS */}
            <section className={`filter-panel desktop-only ${hasActiveFilters ? "has-active-filters" : ""}`}>
              <div className="filter-header">
                <div className="panel-title" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <Filter size={13} />
                  <span>Bộ lọc</span>
                  {activeFilterCount > 0 && (
                    <span className="mobile-filter-count-badge" style={{ marginLeft: "4px" }}>{activeFilterCount}</span>
                  )}
                </div>
                {hasActiveFilters && (
                  <button 
                    className="filter-clear-btn" 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      const { dateFrom, dateTo } = getDefaultDateRange(datasets);
                      setFilters((f) => ({ ...INITIAL_FILTERS, dateFrom, dateTo }));
                    }}
                  >
                    <RotateCcw size={10} style={{ display: "inline", marginRight: 3 }} />
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              <div className="filter-panel-body" style={{ marginTop: "14px" }}>
                <FilterInputs
                  filters={filters}
                  setFilters={setFilters}
                  dateBounds={dateBounds}
                  airlineOptions={airlineOptions}
                  originOptions={originOptions}
                  countryOptions={countryOptions}
                  provinceOptions={provinceOptions}
                  formatAirport={formatAirport}
                />
              </div>

              <ActiveFilterChips filters={filters} hasActiveDateFilter={hasActiveDateFilter} />
            </section>

            {/* MOBILE UNIFIED CONTROL BAR (DATE PICKER & FILTER BUTTON) */}
            <div className="mobile-control-bar mobile-only">
              <div className="mobile-control-row">
                <div className="mobile-control-cell">
                  <DatasetPicker
                    datasets={datasets}
                    activeDate={activeDate}
                    onSelect={setActiveDate}
                    onRemove={removeDataset}
                    importing={importing}
                    onUpload={handleUpload}
                    message={message}
                  />
                </div>
                <div className="mobile-control-cell filter-cell">
                  <button
                    type="button"
                    className={`mobile-filter-trigger-btn ${hasActiveFilters ? "is-active" : ""}`}
                    onClick={() => setIsMobileFilterOpen(true)}
                  >
                    <SlidersHorizontal size={13} />
                    <span>Bộ lọc</span>
                    {activeFilterCount > 0 ? (
                      <span className="mobile-filter-count-badge">{activeFilterCount}</span>
                    ) : (
                      <span className="mobile-filter-hint">Tất cả</span>
                    )}
                    <ChevronDown size={13} style={{ marginLeft: "auto", opacity: 0.6 }} />
                  </button>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="mobile-quick-reset-btn"
                      onClick={() => {
                        const { dateFrom, dateTo } = getDefaultDateRange(datasets);
                        setFilters((f) => ({ ...INITIAL_FILTERS, dateFrom, dateTo }));
                      }}
                      title="Xóa bộ lọc"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>
              {hasActiveFilters && (
                <div className="mobile-chips-row">
                  <ActiveFilterChips
                    filters={filters}
                    hasActiveDateFilter={hasActiveDateFilter}
                    onOpenFilter={() => setIsMobileFilterOpen(true)}
                  />
                </div>
              )}
            </div>

            {/* SCORE CARDS */}
            <section className="score-grid">
              <ScoreCard color="cyan" icon={<Plane size={19} />} label="Chuyến bay chuẩn hóa" value={formatNumber(filteredTotals.legs)} detail={`${formatNumber(filteredTotals.sourceRows)} dòng Excel gốc`} />
              <ScoreCard color="blue" icon={<Users size={19} />} label="Tổng khách bay" value={formatNumber(filteredTotals.passengers)} detail={`ADL ${formatNumber(filteredTotals.adults)} · CHD ${formatNumber(filteredTotals.children)} · INF ${formatNumber(filteredTotals.infants)}`} />
              <ScoreCard color="purple" icon={<ArrowDownToLine size={19} />} label="Đến DAD" value={formatNumber(filteredTotals.arrivals)} detail={`${formatNumber(filteredTotals.arrivalPassengers)} khách đến`} />
              <ScoreCard color="green" icon={<ArrowUpFromLine size={19} />} label="Đi từ DAD" value={formatNumber(filteredTotals.departures)} detail={`${formatNumber(filteredTotals.departurePassengers)} khách đi`} />
              <ScoreCard color="blue" icon={<Globe size={19} />} label="Khách quốc tế" value={formatNumber(filteredTotals.intlPassengers)} detail={`${filteredTotals.passengers > 0 ? ((filteredTotals.intlPassengers / filteredTotals.passengers) * 100).toFixed(1) : 0}% tổng khách · ${formatNumber(filteredTotals.intlLegs)} leg`} />
              <ScoreCard color="gold" icon={<Percent size={19} />} label="Tỷ lệ lấp đầy" value={overallOccupancy.rate !== null ? `${overallOccupancy.rate.toFixed(1)}%` : "—"} detail={`Tính trên ${overallOccupancy.flightsWithCapCount}/${overallOccupancy.totalFlights} leg bay có cấu hình`} />
              <ScoreCard color="green" icon={<Package size={19} />} label="Hàng hóa & Hành lý" value={`${(filteredTotals.totalPayloadKg / 1000).toFixed(1)} tấn`} detail={`HL ${(filteredTotals.baggageKg / 1000).toFixed(1)}T · Hàng ${(filteredTotals.cargoKg / 1000).toFixed(1)}T`} />
              <ScoreCard color="cyan" icon={<MapPinned size={19} />} label="Phạm vi khai thác" value={`${formatNumber(filteredTotals.countryCount)} quốc gia`} detail={`${formatNumber(filteredTotals.airlineCount)} hãng hàng không`} />
            </section>
          </>
        )}
      </div>

      {/* MOBILE FILTER MODAL DRAWER (Bottom Sheet) */}
      {viewMode === "dashboard" && datasets.length > 0 && isMobileFilterOpen && (
        <div className="mobile-filter-overlay mobile-only">
          <div
            className="mobile-filter-backdrop"
            onClick={() => setIsMobileFilterOpen(false)}
          />
          <div className="mobile-filter-drawer" role="dialog" aria-modal="true">
            <div className="drawer-handle" />
            <div className="drawer-header">
              <div className="drawer-title">
                <SlidersHorizontal size={16} />
                <span>Bộ lọc dữ liệu</span>
                {activeFilterCount > 0 && (
                  <span className="mobile-filter-count-badge">{activeFilterCount}</span>
                )}
              </div>
              <div className="drawer-header-actions">
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="filter-clear-btn"
                    onClick={() => {
                      const { dateFrom, dateTo } = getDefaultDateRange(datasets);
                      setFilters({ ...INITIAL_FILTERS, dateFrom, dateTo });
                    }}
                  >
                    <RotateCcw size={11} style={{ display: "inline", marginRight: 3 }} />
                    Đặt lại
                  </button>
                )}
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setIsMobileFilterOpen(false)}
                  aria-label="Đóng bộ lọc"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-body">
              <FilterInputs
                filters={filters}
                setFilters={setFilters}
                dateBounds={dateBounds}
                airlineOptions={airlineOptions}
                originOptions={originOptions}
                countryOptions={countryOptions}
                provinceOptions={provinceOptions}
                formatAirport={formatAirport}
              />
            </div>

            <div className="drawer-footer">
              <button
                type="button"
                className="drawer-apply-btn"
                onClick={() => setIsMobileFilterOpen(false)}
              >
                <Check size={16} />
                <span>Áp dụng & Xem kết quả ({formatNumber(filteredRecords.length)} leg)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT AREA (SCROLLABLE) ── */}
      {viewMode === "users" ? (
        <div className="content-area">
          <UserManagement onBack={() => setViewMode("dashboard")} />
        </div>
      ) : datasets.length > 0 ? (
        <div className="content-area">
          {/* Warnings */}
          {datasets.flatMap((d) => d.warnings).length > 0 && (
            <div className="warning-box" style={{ marginBottom: 12 }}>
              <strong>⚠ Cảnh báo parse ({datasets.flatMap((d) => d.warnings).length} mục)</strong>
              {datasets.flatMap((d) => d.warnings).slice(0, 4).map((w) => <p key={w}>{w}</p>)}
            </div>
          )}

          {/* TABS + TABLE (Desktop only) */}
          <section className="tabs-panel desktop-only">
            <div className="tabbar">
              {(["market", "origin", "airline", "leaderboard", "detail"] as TabKey[]).map((tab) => (
                <button
                  key={tab}
                  className={activeTab === tab ? "active" : ""}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {TAB_LABELS[tab]}
                  {tab !== "leaderboard" && (
                    <span className="tab-count">{formatNumber(tabRowCounts[tab])}</span>
                  )}
                </button>
              ))}
            </div>
            {activeTab === "leaderboard" ? (
              <LeaderboardPanel records={filteredRecords} />
            ) : activeTab === "detail" ? (
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

  if (window.location.hostname === 'localhost') {
    return <>{children}</>;
  }

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
