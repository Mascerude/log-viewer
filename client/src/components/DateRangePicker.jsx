import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "./icons";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function isoFromParts(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
function partsFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}
function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function startWeekday(y, m) {
  const jsDay = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return (jsDay + 6) % 7;
}
function formatDisplay(iso) {
  const { y, m, d } = partsFromISO(iso);
  return `${pad2(d)}.${pad2(m + 1)}.${y}`;
}
function minISO(a, b) {
  return a < b ? a : b;
}
function maxISO(a, b) {
  return a > b ? a : b;
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function DateRangePicker({ from, to, minDate, maxDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);

  const anchor = from || to || maxDate || minDate;
  const anchorParts = anchor ? partsFromISO(anchor) : partsFromISO(isoFromParts(new Date().getFullYear(), new Date().getMonth(), 1));
  const [viewYear, setViewYear] = useState(anchorParts.y);
  const [viewMonth, setViewMonth] = useState(anchorParts.m);

  useEffect(() => {
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function goMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function handleDayClick(iso) {
    if (!from || to) {
      onChange({ from: iso, to: "" });
    } else {
      onChange({ from: minISO(from, iso), to: maxISO(from, iso) });
      setOpen(false);
    }
  }

  const cells = useMemo(() => {
    const total = daysInMonth(viewYear, viewMonth);
    const startPad = startWeekday(viewYear, viewMonth);
    const result = [];
    for (let i = 0; i < startPad; i++) result.push(null);
    for (let d = 1; d <= total; d++) result.push(isoFromParts(viewYear, viewMonth, d));
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewYear, viewMonth]);

  const todayIso = useMemo(() => {
    const now = new Date();
    return isoFromParts(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const label = from ? (to ? `${formatDisplay(from)} – ${formatDisplay(to)}` : `${formatDisplay(from)} – ...`) : "Zeitraum wählen";

  return (
    <div className="date-range-picker" ref={containerRef}>
      <button type="button" className="date-range-trigger" onClick={() => setOpen((v) => !v)}>
        <CalendarIcon />
        <span>{label}</span>
      </button>

      {open && (
        <div className="date-range-popover">
          <div className="date-range-nav">
            <button type="button" onClick={() => goMonth(-1)} aria-label="Vorheriger Monat">
              <ChevronLeftIcon />
            </button>
            <span className="date-range-month-label">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={() => goMonth(1)} aria-label="Nächster Monat">
              <ChevronRightIcon />
            </button>
          </div>

          <div className="date-range-weekdays">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="date-range-grid">
            {cells.map((iso, i) => {
              if (!iso) return <span key={i} className="date-cell date-cell-empty" aria-hidden="true" />;
              const available = (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate);
              const isEdge = iso === from || iso === to;
              const selectedLo = from && to ? minISO(from, to) : from;
              const selectedHi = from && to ? maxISO(from, to) : null;
              const inSelectedRange = selectedHi && iso > selectedLo && iso < selectedHi;
              const inPreviewRange =
                available && from && !to && hovered && iso > minISO(from, hovered) && iso < maxISO(from, hovered);
              const classes = ["date-cell"];
              if (!available) classes.push("date-cell-disabled");
              if (isEdge) classes.push("date-cell-selected");
              if (inSelectedRange || inPreviewRange) classes.push("date-cell-in-range");
              if (iso === todayIso) classes.push("date-cell-today");
              return (
                <button
                  key={iso}
                  type="button"
                  className={classes.join(" ")}
                  disabled={!available}
                  title={!available ? "Keine Logs an diesem Tag" : undefined}
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => setHovered(iso)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {partsFromISO(iso).d}
                </button>
              );
            })}
          </div>

          {(from || to) && (
            <div className="date-range-footer">
              <button type="button" className="date-range-clear" onClick={() => onChange({ from: "", to: "" })}>
                Zurücksetzen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
