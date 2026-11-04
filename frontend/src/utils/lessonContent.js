/**
 * Turns common plain-text exam notes into readable Markdown without changing the words.
 * Already-Markdown content is left alone (only light cleanup).
 */

const MARKDOWN_HINT =
  /(?:^|\n)\s{0,3}(?:#{1,6}\s|\*\*[^*]+\*\*|```|\|[-: ]+\||>\s|\[[^\]]+\]\([^)]+\))/;

// Labels that should become visual callout blocks
const CALLOUT_START =
  /^(definition|example|examples|note|notes|exam\s*tip|tip|key\s*point|key\s*points|important|advantage|advantages|disadvantage|disadvantages|solved\s*problem|solution|summary|remember|caution|warning)\s*[:.\-–—]\s*(.*)$/i;

const NUMBERED = /^(\d{1,3})[.)]\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
const HASH_HEADING = /^#+\s*(.+)$/;
// "#Computer Fundamentals" (no space after #) – common when pasting
const HASH_STUCK = /^#([^#\s].*)$/;

function looksLikeMarkdown(text) {
  if (!text || text.length < 8) return false;
  const hits = (text.match(new RegExp(MARKDOWN_HINT.source, "g")) || []).length;
  // Several real Markdown constructs → treat as Markdown
  return hits >= 2;
}

function isBlank(line) {
  return !line || !line.trim();
}

/**
 * Convert plain pasted notes into Markdown that ReactMarkdown can render cleanly.
 * Never invents or removes educational text — only adds structure markers and spacing.
 * Math normalization always runs at the end so formulas render whether the note
 * was already Markdown or plain text.
 */
export function normalizeLessonContent(raw) {
  if (!raw || typeof raw !== "string") return "";

  // Normalize newlines and trim trailing spaces per line
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));

  // If the author already wrote Markdown, only ensure trailing newline then math-normalize
  if (looksLikeMarkdown(text)) {
    return normalizeMathForRender(lines.join("\n").trim() + "\n");
  }

  const out = [];
  let i = 0;
  let inList = false;

  function flushListGap() {
    if (inList) {
      out.push("");
      inList = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isBlank(line)) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      inList = false;
      i += 1;
      continue;
    }

    // Headings: "#Title" or "# Title" or "## Title"
    const stuck = HASH_STUCK.exec(trimmed);
    const hash = HASH_HEADING.exec(trimmed);
    if (stuck || (hash && !trimmed.startsWith("####"))) {
      flushListGap();
      const title = (stuck ? stuck[1] : hash[1]).trim();
      const level = stuck ? 2 : Math.min((trimmed.match(/^#+/) || ["##"])[0].length, 3);
      out.push("");
      out.push(`${"#".repeat(level)} ${title}`);
      out.push("");
      i += 1;
      continue;
    }

    // Callout labels: Definition: ..., Example: ..., Exam Tip: ...
    const callout = CALLOUT_START.exec(trimmed);
    if (callout) {
      flushListGap();
      const kind = callout[1].replace(/\s+/g, " ").trim();
      const rest = (callout[2] || "").trim();
      out.push("");
      out.push(`> **${kind}:**${rest ? ` ${rest}` : ""}`);
      // Pull following indented / continuation lines into the same blockquote
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (isBlank(next)) break;
        if (NUMBERED.test(next.trim()) || BULLET.test(next.trim()) || HASH_STUCK.test(next.trim()) || HASH_HEADING.test(next.trim())) break;
        if (CALLOUT_START.test(next.trim())) break;
        out.push(`> ${next.trim()}`);
        j += 1;
      }
      out.push("");
      i = j;
      continue;
    }

    // Numbered item
    const num = NUMBERED.exec(trimmed);
    if (num) {
      if (!inList && out.length && out[out.length - 1] !== "") out.push("");
      const n = num[1];
      const body = num[2].trim();

      // "1. What is X? Definition: ..." → keep as list item, promote embedded Definition
      const embedded = /^(.*?)(\b(?:Definition|Example|Note|Exam\s*Tip|Tip|Key\s*Point|Important)\s*[:.\-–—]\s*)(.*)$/i.exec(body);
      if (embedded && embedded[3].length > 12) {
        out.push(`${n}. ${embedded[1].trim()}`.replace(/\s+$/, "") || `${n}.`);
        out.push("");
        out.push(`> **${embedded[2].replace(/[:.\-–—]\s*$/, "").trim()}:** ${embedded[3].trim()}`);
        out.push("");
        inList = false;
      } else {
        out.push(`${n}. ${body}`);
        inList = true;
      }
      i += 1;
      continue;
    }

    // Bullet
    const bullet = BULLET.exec(trimmed);
    if (bullet) {
      if (!inList && out.length && out[out.length - 1] !== "") out.push("");
      out.push(`- ${bullet[1].trim()}`);
      inList = true;
      i += 1;
      continue;
    }

    // Plain paragraph — if we were in a list, a non-numbered line ends the list
    // so it does NOT become a broken continuation of the previous item.
    if (inList) {
      out.push("");
      inList = false;
    }
    out.push(trimmed);
    i += 1;
  }

  // Collapse 3+ blank lines → 2
  const cleaned = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const structured = cleaned ? cleaned + "\n" : "";
  return normalizeMathForRender(structured);
}

/**
 * Display-time math normalization.
 * Converts common AI/pasted forms into delimiters that remark-math + KaTeX understand.
 * Does NOT mutate the stored content — only the string passed to the renderer.
 *
 * Supported conversions (safe / unambiguous only):
 * - [ \begin{aligned} ... \end{aligned} ]  →  $$ ... $$
 * - [ \boxed{...} ]                         →  $$ \boxed{...} $$
 * - Bare \begin{...}...\end{...} blocks     →  $$ ... $$
 * - Bare \boxed{...}, \frac{...}, \sqrt{...} when not already delimited
 * - Full base-conversion equations: (572)_8=(101111010)_2
 * - Number-base subscripts: (101101)_2, (45)_{10}, (0.625)_{10}
 * - Plain powers: x^2, 2^5, (x+1)^2
 * - sqrt(25), √25, ∛27
 * Existing $...$, $$...$$, \(...\), \[...\] are converted/preserved safely.
 */
export function normalizeMathForRender(raw) {
  if (!raw || typeof raw !== "string") return raw || "";

  // Protect fenced code blocks so we never touch math inside them
  const codeBlocks = [];
  let text = raw.replace(/```[\s\S]*?```/g, (m) => {
    const key = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(m);
    return key;
  });

  // Protect existing math delimiters so we don't double-wrap
  const protectedMath = [];
  function protect(re) {
    text = text.replace(re, (m) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(m);
      return key;
    });
  }

  // Order matters: longer / block forms first
  protect(/\$\$[\s\S]*?\$\$/g);

  // Convert \[...\] and \(...\) into $$ / $ so remark-math always recognizes them
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$$${inner}$$`);
    return key;
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$${inner}$`);
    return key;
  });
  protect(/\$[^$\n]+\$/g);

  // 1. Square-bracketed complete LaTeX environments / boxed answers
  //    e.g. [\begin{aligned} ... \end{aligned}]  or  [\boxed{(25)_{10}=(11001)_2}]
  text = text.replace(
    /\[\s*((?:\\begin\{[a-z*]+\}[\s\S]*?\\end\{[a-z*]+\}|\\boxed\{(?:[^{}]|\{[^{}]*\})*\}))\s*\]/gi,
    (_, inner) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$$\n${inner.trim()}\n$$`);
      return key;
    }
  );

  // 2. Bare multi-line \begin{aligned|equation|gather|align|cases|matrix|...}...\end{...}
  text = text.replace(
    /(\\begin\{(?:aligned|align|equation|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\*?\}[\s\S]*?\\end\{(?:aligned|align|equation|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\*?\})/gi,
    (m) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$$\n${m}\n$$`);
      return key;
    }
  );

  // 3. Bare \boxed{...} (single level of nested braces)
  text = text.replace(/(\\boxed\{(?:[^{}]|\{[^{}]*\})*\})/g, (m) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$$${m}$$`);
    return key;
  });

  // 4. Common standalone LaTeX commands that appear without delimiters
  //    \frac{a}{b}, \sqrt{...}, \sqrt[n]{...}, \sum_{}, \prod_{}, \int, \lim
  text = text.replace(
    /(\\frac\{(?:[^{}]|\{[^{}]*\})*\}\{(?:[^{}]|\{[^{}]*\})*\}|\\sqrt(?:\[[^\]]*\])?\{(?:[^{}]|\{[^{}]*\})*\}|\\(?:sum|prod|int|lim|log|ln|sin|cos|tan|max|min)(?:_\{[^}]*\})?(?:\^\{[^}]*\})?)/g,
    (m) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$${m}$`);
      return key;
    }
  );

  // 5a. Full conversion equations as ONE math unit so Markdown emphasis
  //     does not eat underscores and so \boxed borders are not split.
  //     e.g. (572)_8=(101111010)_2  or  (0.625)_{10}=(0.101)_2
  text = text.replace(
    /(\((?:[0-9A-Fa-f]+(?:\.[0-9A-Fa-f]+)?)\)_(?:\{?\d{1,2}\}?)\s*=\s*\((?:[0-9A-Fa-f]+(?:\.[0-9A-Fa-f]+)?)\)_(?:\{?\d{1,2}\}?))/g,
    (m) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$$${m}$$`);
      return key;
    }
  );

  // 5b. Single number-base / subscript tokens: (101101)_2 , (45)_{10} , (0.625)_{10}
  text = text.replace(
    /(\((?:[0-9A-Fa-f]+(?:\.[0-9A-Fa-f]+)?)\)_(?:\{?\d{1,2}\}?))/g,
    (m) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$${m}$`);
      return key;
    }
  );

  // 6. Plain-text powers: letter/digit or simple parenthesized expr followed by ^digit or ^{...}
  //    Avoids identifiers like my_var_2 or URLs.
  text = text.replace(
    /(?<![\w/\\])(\([^)]{1,40}\)|\b[A-Za-z0-9]+)(\^(?:\{[^}]+\}|\d+))(?![\w{])/g,
    (_, base, exp) => {
      const key = `@@MATH${protectedMath.length}@@`;
      protectedMath.push(`$${base}${exp}$`);
      return key;
    }
  );

  // 7. Function-style roots: sqrt(25), cbrt(27)
  text = text.replace(
    /\b(sqrt|cbrt)\s*\(\s*([^)]+?)\s*\)/gi,
    (_, fn, arg) => {
      const key = `@@MATH${protectedMath.length}@@`;
      const latex = fn.toLowerCase() === "cbrt" ? `\\sqrt[3]{${arg}}` : `\\sqrt{${arg}}`;
      protectedMath.push(`$${latex}$`);
      return key;
    }
  );

  // 8. Unicode roots: √25, ∛27, ∜16
  text = text.replace(/√\s*\(?\s*([^)\s]+)\s*\)?/g, (_, arg) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$\\sqrt{${arg}}$`);
    return key;
  });
  text = text.replace(/∛\s*\(?\s*([^)\s]+)\s*\)?/g, (_, arg) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$\\sqrt[3]{${arg}}$`);
    return key;
  });
  text = text.replace(/∜\s*\(?\s*([^)\s]+)\s*\)?/g, (_, arg) => {
    const key = `@@MATH${protectedMath.length}@@`;
    protectedMath.push(`$\\sqrt[4]{${arg}}$`);
    return key;
  });

  // Restore protected math (reverse order so nested indices stay correct).
  // Use split/join so "$" in LaTeX is not interpreted by String.replace.
  for (let i = protectedMath.length - 1; i >= 0; i--) {
    const token = `@@MATH${i}@@`;
    const value = protectedMath[i];
    text = text.split(token).join(value);
  }

  // Restore code blocks
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const token = `@@CODEBLOCK${i}@@`;
    const value = codeBlocks[i];
    text = text.split(token).join(value);
  }

  return text;
}

/**
 * Extract simple TOC entries from Markdown headings (## and ###).
 */
export function extractToc(markdown) {
  if (!markdown) return [];
  const items = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const level = m[1].length;
    const text = m[2].replace(/[*_`]/g, "").trim();
    if (!text) continue;
    const id = text
      .toLowerCase()
      .replace(/[^\w\u0980-\u09FF\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80);
    items.push({ level, text, id });
  }
  return items;
}