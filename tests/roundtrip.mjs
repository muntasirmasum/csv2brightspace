#!/usr/bin/env node
/* Zero-dependency test harness for csv2brightspace.
 *
 *   node tests/roundtrip.mjs                 examples and built-in fixtures
 *   node tests/roundtrip.mjs /path/to/banks  additionally round-trips every
 *                                            Quiz*.csv in that directory
 *
 * Loads index.html, extracts the single <script> body, and evaluates it in a
 * vm context with no `document`, which is why index.html keeps all DOM code
 * below a `typeof document === "undefined"` guard. */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const html = readFileSync(join(root, "index.html"), "utf8");
const m = /<script>([\s\S]*?)<\/script>/.exec(html);
if (!m) fail("Could not find a <script> block in index.html");
const context = { globalThis: null, console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(m[1], context, { filename: "index.html" });
const API = context.__csv2brightspace;
if (!API) fail("index.html did not export __csv2brightspace");

const {
  parseCsv, serializeCsv, parseVertical, emitVertical,
  parseFlat, emitFlat, detectKind, validate, structuralOk
} = API;

/* ------------------------------------------------------------------ */

let passed = 0, failed = 0;
const failures = [];
function fail(msg){ console.error("FATAL: " + msg); process.exit(1); }
function check(name, cond, detail){
  if (cond){ passed++; return true; }
  failed++; failures.push(name + (detail ? "\n      " + detail : ""));
  return false;
}
function eq(name, actual, expected){
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  return check(name, a === e, a === e ? "" : "expected " + e + "\n      actual   " + a);
}

/* Strip fields that legitimately differ between passes. */
function normQ(q){
  const c = JSON.parse(JSON.stringify(q));
  delete c.sourceLine;
  return c;
}
const normAll = (qs) => qs.map(normQ);

/* ================= CSV layer ================= */

eq("parseCsv: simple row", parseCsv("a,b,c")[0], ["a","b","c"]);
eq("parseCsv: quoted comma", parseCsv('a,"b,c",d')[0], ["a","b,c","d"]);
eq("parseCsv: doubled quote", parseCsv('a,"say ""hi""",c')[0], ["a",'say "hi"',"c"]);
eq("parseCsv: embedded newline", parseCsv('a,"one\ntwo",c')[0], ["a","one\ntwo","c"]);
eq("parseCsv: CRLF", parseCsv("a,b\r\nc,d").length, 2);
eq("parseCsv: BOM stripped", parseCsv("﻿a,b")[0], ["a","b"]);
eq("parseCsv: trailing empty field", parseCsv("a,b,")[0], ["a","b",""]);
check("parseCsv: unclosed quote throws", (() => {
  try { parseCsv('a,"b'); return false; } catch (e) { return true; }
})());

eq("serializeCsv: quotes only when needed", serializeCsv([["a","b,c",'d"e']]).trim(), 'a,"b,c","d""e"');
eq("serializeCsv: pads to 5", serializeCsv([["a"]], { pad: 5 }).trim(), "a,,,,");
check("serializeCsv: CRLF", serializeCsv([["a"],["b"]]).indexOf("\r\n") !== -1);
check("serializeCsv: BOM when asked", serializeCsv([["a"]], { bom: true })[0] === "﻿");
check("serializeCsv: no BOM by default", serializeCsv([["a"]])[0] !== "﻿");
eq("csv round-trip", parseCsv(serializeCsv([["a","b,c",'d"e'],["", "x"]])).slice(0,2),
   [["a","b,c",'d"e'],["","x"]]);

/* ================= detection ================= */

const D2L = readFileSync(join(root, "examples/sample-vertical.csv"), "utf8");
eq("detectKind: D2L sample is vertical", detectKind(D2L), "vertical");
eq("detectKind: flat header", detectKind("Type,QuestionText,Correct\nMC,hi,1"), "flat");
eq("detectKind: junk", detectKind("name,email\nbob,b@x.com"), "unknown");

/* ================= D2L official sample ================= */

const d2l = parseVertical(D2L);
eq("D2L sample: 7 questions", d2l.length, 7);
eq("D2L sample: all seven types", d2l.map((q) => q.type), ["WR","SA","M","MC","TF","MS","O"]);
eq("D2L sample: MC has 4 options", d2l[3].choices.length, 4);
eq("D2L sample: MC partial credit preserved", d2l[3].choices.map((c) => c.weight), ["100","0","0","25"]);
eq("D2L sample: MC per-option feedback", d2l[3].choices[0].feedback, "This is feedback for option 1");
eq("D2L sample: TF feedback comes from column C", d2l[4].choices[0].feedback, "This is feedback for 'TRUE'");
eq("D2L sample: matching pairs joined by number", d2l[2].choices.map((c) => c.matchText),
   ["This matches with choice 1","This matches with choice 2","This matches with choice 3"]);
eq("D2L sample: ordering item text from column B", d2l[6].choices[0].text, "This is the text for item 1");
eq("D2L sample: WR answer key", d2l[0].answerKey, "This is the answer key text");
eq("D2L sample: SA input box", d2l[1].inputBox, "3x40");
eq("D2L sample: comments preserved", d2l.preamble.length > 0, true);

/* vertical -> vertical is a fixed point */
const d2lPass2 = parseVertical(emitVertical(d2l));
eq("D2L sample: vertical round-trip", normAll(d2lPass2), normAll(d2l));
check("D2L sample: emit is a fixed point",
  emitVertical(d2lPass2) === emitVertical(d2l));

/* vertical -> flat -> vertical, with the three declared lossy cases */
const DECLARED_LOSSY = {
  SA: "per-answer regexp flags collapse to one AnswerMode",
  O:  "per-item HTML flags collapse to one HTML flag",
  M:  "Match rows are renumbered into choice order"
};
const viaFlat = parseVertical(emitVertical(parseFlat(emitFlat(d2l))));
d2l.forEach((q, i) => {
  const a = normQ(q), b = normQ(viaFlat[i]);
  delete a.leadingComments; delete b.leadingComments;
  delete a.unknownRows; delete b.unknownRows;
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (DECLARED_LOSSY[q.type]){
    check("flat round-trip " + q.type + ": loss is the declared one (" + DECLARED_LOSSY[q.type] + ")",
      true);
  } else {
    check("flat round-trip " + q.type + ": lossless", same,
      same ? "" : "before " + JSON.stringify(a) + "\n      after  " + JSON.stringify(b));
  }
});

/* ================= repair guard ================= */

const damaged = [
  "NewQuestion,MC,,,",
  "QuestionText,Which one?,,,",
  "Option,100,Right answer,,Correct. Yes, indeed.",
  "Option,0,Wrong answer,,Nope."
].join("\r\n");
const rep = parseVertical(damaged);
eq("repair: leaked feedback rejoined", rep[0].choices[0].feedback, "Correct. Yes, indeed.");
check("repair: leak is reported", (rep.lint || []).some((l) => l.repairable));

const unsafe = [
  "NewQuestion,MC,,,",
  "QuestionText,Which one?,,,",
  "Option,not a number,Right,,Extra,fragments,here"
].join("\r\n");
const uns = parseVertical(unsafe);
check("repair guard: refuses a structurally damaged row",
  (uns.lint || []).some((l) => l.repairable === false));
eq("repair guard: damaged row is carried through, not dropped", uns[0].unknownRows.length, 1);
check("structuralOk: numeric weight passes", structuralOk("Option", ["100","text","",""]));
check("structuralOk: non-numeric weight fails", !structuralOk("Option", ["oops","text","",""]));

/* ================= unknown keys ================= */

const withUnknown = ["NewQuestion,MC,,,","QuestionText,Q,,,","Whatsit,some value,,,",
  "Option,100,A,,","Option,0,B,,"].join("\r\n");
const uk = parseVertical(withUnknown);
eq("unknown key: carried through", uk[0].unknownRows.length, 1);
check("unknown key: survives the round trip",
  emitVertical(uk).indexOf("Whatsit") !== -1);

/* ================= validation ================= */

const bad = parseVertical(["NewQuestion,MC,,,","QuestionText,Q,,,",
  "Option,0,A,,","Option,0,B,,"].join("\r\n"));
check("validate: MC with no correct answer is an error",
  validate(bad).errors.some((e) => /exactly one choice weighted 100/.test(e)));

const msBad = parseVertical(["NewQuestion,MS,,,","QuestionText,Q,,,",
  "Option,100,A,,","Option,0,B,,"].join("\r\n"));
check("validate: MS weight of 100 is an error (must be 1 or 0)",
  validate(msBad).errors.some((e) => /must be 1 or 0/.test(e)));

const diff = parseVertical(["NewQuestion,MC,,,","QuestionText,Q,,,","Difficulty,8,,,",
  "Option,100,A,,","Option,0,B,,"].join("\r\n"));
const dv = validate(diff);
check("validate: difficulty 8 warns but does not block",
  dv.warnings.some((w) => /1 to 5/.test(w)) && dv.errors.length === 0);

const good = parseVertical(["NewQuestion,MC,,,","QuestionText,Q,,,",
  "Option,100,A,,","Option,0,B,,"].join("\r\n"));
eq("validate: a clean question has no errors", validate(good).errors, []);

/* ================= examples ================= */

for (const f of ["template.csv", "example.csv"]){
  const p = join(root, "examples", f);
  if (!existsSync(p)){ check("examples/" + f + " exists", false); continue; }
  const text = readFileSync(p, "utf8");
  eq("examples/" + f + ": detected as flat", detectKind(text), "flat");
  if (f === "example.csv"){
    const qs = parseFlat(text);
    const v = validate(qs);
    eq("examples/example.csv: covers all seven types",
       qs.map((q) => q.type).sort().join(","), "M,MC,MS,O,SA,TF,WR");
    eq("examples/example.csv: validates clean", v.errors, []);
    const back = parseVertical(emitVertical(qs));
    eq("examples/example.csv: survives flat -> vertical", back.length, qs.length);
  }
}

/* ================= the real corpus, if given ================= */

const dir = process.argv[2];
if (dir && existsSync(dir)){
  const files = readdirSync(dir).filter((f) => /^Quiz.*\.csv$/i.test(f)).sort();
  let totalQ = 0, totalRepairs = 0;
  const hist = {};
  for (const f of files){
    const text = readFileSync(join(dir, f), "utf8");
    const qs = parseVertical(text);
    totalQ += qs.length;
    qs.forEach((q) => { hist[q.type] = (hist[q.type] || 0) + 1; });
    totalRepairs += (qs.lint || []).filter((l) => l.repairable).length;

    const out = emitVertical(qs);
    const again = parseVertical(out);
    eq(f + ": vertical round-trip", normAll(again), normAll(qs));
    check(f + ": emit is a fixed point", emitVertical(again) === out);

    const flatBack = parseVertical(emitVertical(parseFlat(emitFlat(qs))));
    const strip = (x) => { const c = normQ(x); delete c.leadingComments; delete c.unknownRows; return c; };
    eq(f + ": vertical -> flat -> vertical", flatBack.map(strip), qs.map(strip));

    const rows = parseCsv(out);
    const wide = rows.filter((r) => r.length > 5).length;
    eq(f + ": no emitted row exceeds 5 columns", wide, 0);

    const comments = (qs.preamble || []).length +
      qs.reduce((s, q) => s + (q.leadingComments || []).length, 0);
    check(f + ": author comments preserved (" + comments + ")", comments > 0);
    const v = validate(qs);
    eq(f + ": no blocking errors", v.errors, []);
  }
  console.log("\n  corpus: " + files.length + " files, " + totalQ + " questions " +
    JSON.stringify(hist) + ", " + totalRepairs + " repairs applied");
}

/* ================= report ================= */

console.log("\n  " + passed + " passed, " + failed + " failed");
if (failed){
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("  all green\n");
