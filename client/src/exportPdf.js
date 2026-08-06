// Sends the already-assembled entries to the server, which renders a real
// PDF (pdfkit) and streams it back — then saves the response as a file via
// a throwaway object-URL anchor, so it downloads directly instead of
// routing through the browser's print dialog. `title` is the heading printed
// inside the document; `filename` (falls back to `title`) is what the saved
// file is called.
export async function downloadLogEntriesPdf(entries, { title, filename, showSource, showService }) {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, filename: filename || title, showSource, showService, entries }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PDF-Export fehlgeschlagen (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Strip only characters Windows/macOS actually forbid in filenames — keep
  // umlauts etc. readable instead of flattening them to underscores.
  const name = (filename || title || "export").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  a.download = `${name || "export"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
