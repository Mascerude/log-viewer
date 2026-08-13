import { ChevronRightIcon } from "./icons";

// Generic expand/collapse wrapper for a home-page section — used by
// RecentErrorsSection and ErrorsBySourceSection so both start collapsed
// (nothing is fetched until opened) and share the same header/chevron look.
export default function CollapsibleSection({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="chart-card">
      <button type="button" className="collapsible-toggle" onClick={onToggle} aria-expanded={open}>
        <ChevronRightIcon className={`collapsible-chevron${open ? " open" : ""}`} />
        <h2>{title}</h2>
      </button>
      {subtitle && <p className="chart-subtitle collapsible-subtitle">{subtitle}</p>}
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}
