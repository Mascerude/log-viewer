// Small labeled on/off switch. `variant="accent"` uses the app's normal
// black/white accent for the "on" state (general UI toggles); the default
// (no variant) uses the amber diff color, reserved for the compare modal's
// diff-highlighting toggles.
export default function ToggleSwitch({ checked, onChange, children, variant }) {
  return (
    <label className="toggle-switch-label">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${variant ? ` switch-${variant}` : ""}${checked ? " switch-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
      {children}
    </label>
  );
}
