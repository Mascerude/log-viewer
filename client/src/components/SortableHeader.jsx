import { ChevronDownIcon } from "./icons";

export default function SortableHeader({ label, column, sortBy, sortDir, onSort, className = "" }) {
  const active = sortBy === column;
  return (
    <th
      className={`${className} th-sortable`.trim()}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className={`sortable-header${active ? " active" : ""}`} onClick={() => onSort(column)}>
        {label}
        <ChevronDownIcon className={`sort-icon${active ? " visible" : ""}${active && sortDir === "asc" ? " asc" : ""}`} />
      </button>
    </th>
  );
}
