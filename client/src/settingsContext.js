import { createContext, useContext } from "react";

// App-wide settings that would otherwise need threading through several
// layers of modals (LogEntryModal -> MessageOccurrences -> GoToPage etc.) —
// kept in one small context instead of prop-drilling.
const SettingsContext = createContext({ goToPageDelaySeconds: 1.5 });

export const SettingsProvider = SettingsContext.Provider;

export function useAppSettings() {
  return useContext(SettingsContext);
}
