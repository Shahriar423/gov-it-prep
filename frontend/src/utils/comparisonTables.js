/**
 * Turns "A vs B" comparisons that were pasted as flat text into real Markdown tables.
 *
 * Pasted comparison tables usually arrive flattened, one table row per line:
 *
 *   1. Data vs Information
 *   Data Information
 *   Data is a collection of raw facts. Information is processed and meaningful data.
 *   It may not have a clear meaning. It has a clear meaning.
 *
 * This finds the "A vs B" title, then rebuilds the lines below it as a two-column table.
 * It only converts when the result looks right; otherwise the text is left exactly as it was.
 * Only the string given to the renderer changes; the saved chapter content is never touched.
 */

const TITLE_VS = /^(.+?)\s+(?:vs\.?|v\/s|versus)\s+(.+)$/i;
const TITLE_DIFF =
  /^(?:what\s+(?:is|are)\s+the\s+)?differences?\s+between\s+(.+?)\s+and\s+(.+)$/i;

const NUMBERED = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

// Lines that start another Markdown block: they end a comparison body
const STRUCTURE =
  /^\s*(?:>|\#{1,6}\s|[-*+]\s|\||\d{1,3}[.)]\s|```)/;

const MAX_BODY_LINES = 30;
const MAX_ROWS = 25;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "RAM (Differences)" -> "RAM"
// "Compiler:" -> "Compiler"
function cleanName(raw) {
  return raw
    .replace(/[^)]*\s*$/, "")
    .replace(/\s+(?:differences?|comparison)\s*$/i, "")
    .replace(/[?:.\s]+$/g, "")
    .replace(/^[*_]+|[*_]+$/g, "")
    .trim();
}

// Reads a title line and returns the two things being compared, or null
function parseTitle(line) {
  let text = line.trim();

  if (!text) return null;

  const numbered = NUMBERED.exec(text);
  const heading = HEADING.exec(text);

  if (numbered) {
    text = numbered[1];
  } else if (heading) {
    text = heading[1];
  } else if (STRUCTURE.test(line)) {
    return null;
  }

  text = text
    .trim()
    .replace(/^(\*\*|__)(.*)\1$/, "$2")
    .replace(/[:?]+$/, "")
    .trim();

  if (text.length > 90 || /[.!]$/.test(text)) {
    return null;
  }

  const match = TITLE_VS.exec(text) || TITLE_DIFF.exec(text);

  if (!match) return null;

  const a = cleanName(match[1]);
  const b = cleanName(match[2]);

  if (!a || !b || a.length > 40 || b.length > 40) {
    return null;
  }

  return { a, b };
}

// Lines under the title that belong to the comparison
// One blank line after the title is allowed.
function collectBody(lines, start) {
  let j = start;

  if (j < lines.length && lines[j].trim() === "") {
    j += 1;
  }

  const bodyStart = j;

  while (j < lines.length && j - bodyStart < MAX_BODY_LINES) {
    const line = lines[j];

    if (!line.trim()) break;

    if (STRUCTURE.test(line) || parseTitle(line)) {
      break;
    }

    j += 1;
  }

  return {
    body: lines.slice(bodyStart, j),
    end: j,
  };
}

// Splits text into sentences, without cutting after abbreviations
// such as e.g., i.e., vs., etc.
function splitSentences(text) {
  const safe = text.replace(
    /\b(e\.g|i\.e|vs|etc|fig|no|dr|mr|mrs|ms|approx|st)\./gi,
    (m) => `${m.slice(0, -1)}\u0001`
  );

  return safe
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[$])/)
    .map((s) => s.replace(/\u0001/g, ".").trim())
    .filter(Boolean);
}

// Returns the table rows [[cellA, cellB], ...],
// or null when the text does not look like a comparison.
function buildRows(a, b, bodyLines) {
  const lines = bodyLines
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  // Optional header line:
  // "Data Information"
  // "Data | Information"
  // "Data: Information"
  //
  // It may appear alone or before the first comparison row.
  const header = new RegExp(
    `^${escapeRegExp(a)}\\s*[|:,-]?\\s+${escapeRegExp(
      b
    )}\\b[\\s:|]*`,
    "i"
  ).exec(lines[0]);

  if (header) {
    const rest = lines[0].slice(header[0].length).trim();

    if (rest) {
      lines[0] = rest;
    } else {
      lines.shift();
    }
  }

  if (!lines.length) return null;

  const perLine = lines.map(splitSentences);

  let rows;

  /*
   * Normal comparison format:
   *
   * A sentence. B sentence.
   * A sentence. B sentence.
   * A sentence. B sentence.
   *
   * Each physical line must contain an even number of sentences.
   */
  if (
    lines.length > 1 &&
    perLine.every(
      (sentences) =>
        sentences.length >= 2 && sentences.length % 2 === 0
    )
  ) {
    rows = perLine.map((sentences) => {
      const half = sentences.length / 2;

      return [
        sentences.slice(0, half).join(" "),
        sentences.slice(half).join(" "),
      ];
    });
  } else {
    /*
     * Fallback:
     * If all comparison sentences were flattened together,
     * take them two at a time.
     */
    const all = perLine.flat();

    if (all.length < 4 || all.length % 2 !== 0) {
      return null;
    }

    rows = [];

    for (let k = 0; k < all.length; k += 2) {
      rows.push([all[k], all[k + 1]]);
    }
  }

  if (rows.length < 2 || rows.length > MAX_ROWS) {
    return null;
  }

  /*
   * IMPORTANT:
   *
   * We intentionally do NOT require the first row to contain
   * the comparison names.
   *
   * Example:
   *
   * Encapsulation vs Abstraction
   * It combines data and methods into a single unit.
   * It hides unnecessary implementation details.
   *
   * The title already tells us that this is an
   * Encapsulation vs Abstraction comparison.
   *
   * The previous mentions() validation incorrectly rejected
   * many valid comparisons when the first row did not repeat
   * the words "Encapsulation" and "Abstraction".
   */

  return rows;
}

function cell(text) {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function tableLines(a, b, rows) {
  return [
    `| ${cell(a)} | ${cell(b)} |`,
    "| --- | --- |",
    ...rows.map(
      ([x, y]) => `| ${cell(x)} | ${cell(y)} |`
    ),
  ];
}

/**
 * Rebuilds flattened "A vs B" comparisons in Markdown text as tables.
 */
export function convertComparisonTables(markdown) {
  if (!markdown || typeof markdown !== "string") {
    return markdown || "";
  }

  const lines = markdown.split("\n");
  const out = [];

  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Do not process fenced code blocks
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      i += 1;
      continue;
    }

    if (inFence) {
      out.push(line);
      i += 1;
      continue;
    }

    const title = parseTitle(line);

    if (title) {
      const { body, end } = collectBody(lines, i + 1);

      const rows = body.length
        ? buildRows(title.a, title.b, body)
        : null;

      if (rows) {
        out.push(
          line,
          "",
          ...tableLines(title.a, title.b, rows),
          ""
        );

        i = end;
        continue;
      }
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n");
}
