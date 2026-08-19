// A share's link — anyone opening this URL (on the same server) gets the
// shared entry/comparison resolved and shown automatically, same pattern as
// SavedSearches.jsx's own "?savedSearch=" share link.
export function buildShareLink(id) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("share", id);
  return url.toString();
}

export function getInitialShareId() {
  return new URLSearchParams(window.location.search).get("share");
}
