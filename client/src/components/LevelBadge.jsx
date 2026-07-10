import { LEVEL_COLORS } from "../levelColors";

export default function LevelBadge({ level }) {
  const color = LEVEL_COLORS[level] || "#898781";
  return (
    <span className="level-badge" style={{ "--badge-color": color }}>
      <span className="level-dot" aria-hidden="true" />
      {level}
    </span>
  );
}
