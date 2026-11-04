/**
 * Lightweight unit tests for math normalization.
 * Run: node src/utils/lessonContent.math.test.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "lessonContent.js"), "utf8");

// Load normalizeMathForRender without a full ESM export cycle
const start = src.indexOf("export function normalizeMathForRender");
const end = src.indexOf("\nexport function extractToc");
if (start < 0 || end < 0) throw new Error("Could not locate normalizeMathForRender");
// eslint-disable-next-line no-eval
eval(src.slice(start, end).replace("export function", "function") + "; globalThis.normalizeMathForRender = normalizeMathForRender;");

const { normalizeMathForRender } = globalThis;

const cases = [
  {
    name: "aligned block in brackets",
    input: String.raw`[\begin{aligned}
(101101)_2 &= 1(2^5)+0(2^4)+1(2^3) \\
&\quad+1(2^2)+0(2^1)+1(2^0) \\
&=32+0+8+4+0+1 \\
&=\boxed{45}
\end{aligned}]`,
    includes: ["$$", "\\begin{aligned}", "\\boxed{45}", "\\end{aligned}"],
  },
  {
    name: "boxed in brackets",
    input: String.raw`[\boxed{(25)_{10}=(11001)_2}]`,
    includes: ["$$", "\\boxed{(25)_{10}=(11001)_2}"],
  },
  {
    name: "binary subscript",
    input: "(1101011)_2",
    includes: ["$(1101011)_2$"],
  },
  {
    name: "sqrt / frac / power",
    input: String.raw`\sqrt{25} \frac{1}{2} x^2`,
    includes: ["$\\sqrt{25}$", "$\\frac{1}{2}$", "$x^2$"],
  },
  {
    name: "parenthesized power",
    input: "(x+1)^2",
    includes: ["$(x+1)^2$"],
  },
  {
    name: "preserve code and identifiers",
    input: "```\nx^2\n```\nmy_var_2 file_name.txt",
    equals: "```\nx^2\n```\nmy_var_2 file_name.txt",
  },
  {
    name: "preserve existing delimiters",
    input: "Already $x^2$ and $$\\frac{1}{2}$$ stay",
    equals: "Already $x^2$ and $$\\frac{1}{2}$$ stay",
  },
  {
    name: "unicode and function roots",
    input: "√25 sqrt(16) ∛27",
    includes: ["$\\sqrt{25}$", "$\\sqrt{16}$", "$\\sqrt[3]{27}$"],
  },
];

let failed = 0;
for (const c of cases) {
  const out = normalizeMathForRender(c.input);
  let ok = true;
  if (c.equals !== undefined && out !== c.equals) ok = false;
  if (c.includes) {
    for (const part of c.includes) {
      if (!out.includes(part)) ok = false;
    }
  }
  console.log(ok ? "PASS" : "FAIL", c.name);
  if (!ok) {
    failed += 1;
    console.log("  got:", JSON.stringify(out).slice(0, 240));
  }
}

// Optional KaTeX smoke test when the package is available
try {
  const require = createRequire(import.meta.url);
  const katex = require("katex");
  const tex = normalizeMathForRender(String.raw`[\boxed{(25)_{10}=(11001)_2}]`);
  const inner = tex.match(/\$\$([\s\S]*?)\$\$/)[1].trim();
  katex.renderToString(inner, { displayMode: true, throwOnError: true });
  console.log("PASS katex render boxed answer");
} catch (e) {
  if (e.code === "MODULE_NOT_FOUND") {
    console.log("SKIP katex (not installed in this environment)");
  } else {
    console.log("FAIL katex", e.message);
    failed += 1;
  }
}

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);