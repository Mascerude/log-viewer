// Word-level diff between two message strings, used by the "compare entries"
// modal to highlight exactly which words changed instead of just flagging
// the whole message as different. Classic LCS over whitespace-delimited
// tokens (whitespace itself is kept as its own token so the original text
// reconstructs exactly).

function tokenize(text) {
  return String(text ?? "").split(/(\s+)/).filter((t) => t.length > 0);
}

// Returns [tokensA, tokensB], each an array of { text, changed } aligned to
// the input order, with unchanged (shared) tokens marked changed: false.
function diffTokenized(tokensA, tokensB) {
  const n = tokensA.length;
  const m = tokensB.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = tokensA[i] === tokensB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const resultA = [];
  const resultB = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (tokensA[i] === tokensB[j]) {
      resultA.push({ text: tokensA[i], changed: false });
      resultB.push({ text: tokensB[j], changed: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      resultA.push({ text: tokensA[i], changed: true });
      i++;
    } else {
      resultB.push({ text: tokensB[j], changed: true });
      j++;
    }
  }
  while (i < n) {
    resultA.push({ text: tokensA[i], changed: true });
    i++;
  }
  while (j < m) {
    resultB.push({ text: tokensB[j], changed: true });
    j++;
  }
  return [resultA, resultB];
}

// Diffs every entry's message against the first entry's (the baseline).
// Returns one token array per entry, same order as `entries`, or null if
// there's nothing to compare. The baseline's own tokens are marked changed
// if they differ from ANY of the other entries.
export function computeMessageDiffs(entries) {
  if (!entries || entries.length < 2) return null;

  const baseTokens = tokenize(entries[0].message);
  const baseChanged = new Array(baseTokens.length).fill(false);
  const perEntry = new Array(entries.length);

  for (let i = 1; i < entries.length; i++) {
    const [aTokens, bTokens] = diffTokenized(baseTokens, tokenize(entries[i].message));
    aTokens.forEach((t, idx) => {
      if (t.changed) baseChanged[idx] = true;
    });
    perEntry[i] = bTokens;
  }

  perEntry[0] = baseTokens.map((text, idx) => ({ text, changed: baseChanged[idx] }));
  return perEntry;
}
