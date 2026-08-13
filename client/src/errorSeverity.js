// Traffic light shared by "Fehler pro Quelle" (HomePage) and the optional
// sidebar colorization (Einstellungen → "Farbliche Hervorhebung") — same
// thresholds (Einstellungen → Fehler-Schwellenwerte), same three buckets.
export function errorSeverity(count, warningThreshold, criticalThreshold) {
  if (count >= criticalThreshold) return "critical";
  if (count >= warningThreshold) return "warning";
  return "good";
}
