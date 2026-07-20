// Plain-text copy — what ends up on the clipboard is exactly `text`, so it
// pastes as readable text anywhere (chat apps, plain editors, ...).
export async function copyPlainText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through to the legacy fallback below
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

// Rich-text copy — writes both an HTML and a plain-text representation, so a
// rich text editor (e.g. an Azure DevOps work item field) pastes the
// formatted HTML, while anything that only understands plain text still gets
// a sensible fallback.
export async function copyRichText(html, text) {
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // fall through to the legacy fallback below
    }
  }
  // Legacy fallback: render the HTML into a hidden node, select it, and let
  // execCommand('copy') capture both the rendered HTML and its text content.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.innerHTML = html;
  document.body.appendChild(container);
  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("copy");
  selection.removeAllRanges();
  document.body.removeChild(container);
}
