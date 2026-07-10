// Status palette: log severities map 1:1 onto good/warning/serious/critical.
// Same hex works on both light and dark chart surfaces (validated).
export const LEVEL_ORDER = ["Debug", "Info", "Warning", "Error", "Fatal"];

export const LEVEL_COLORS = {
  Debug: "#898781", // muted ink
  Info: "#0ca30c", // good
  Warning: "#fab219", // warning
  Error: "#ec835a", // serious
  Fatal: "#d03b3b", // critical
};

export const LEVEL_LETTERS = {
  Debug: "D",
  Info: "I",
  Warning: "W",
  Error: "E",
  Fatal: "F",
};
