// Reproducible synthetic engineering inputs. No model calls, student records,
// scores, answers, teacher annotations or condition names are embedded in images.
// Run: node scripts/diagram-validation-fixtures.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const output = fileURLToPath(new URL("../docs/diagram-live-validation/images/", import.meta.url));
const WIDTH = 1200, HEIGHT = 900;
const x = q => 175 + 8.2 * q;
const y = p => 740 - 5.8 * p;
const ink = "#172027", guide = "#747e84";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fmt = value => Number(value.toFixed(3));
function text(px, py, label, size = 30, anchor = "start", extra = "") {
  return `<text x="${fmt(px)}" y="${fmt(py)}" font-size="${size}" text-anchor="${anchor}" ${extra}>${escape(label)}</text>`;
}
function line(q1, p1, q2, p2, extra = "") {
  return `<line x1="${fmt(x(q1))}" y1="${fmt(y(p1))}" x2="${fmt(x(q2))}" y2="${fmt(y(p2))}" ${extra}/>`;
}
function curve(slope, intercept, start, end, label, labelQ, labelP) {
  return line(start, slope * start + intercept, end, slope * end + intercept, `stroke="${ink}" stroke-width="5"`)
    + text(x(labelQ), y(labelP), label, 31);
}
function intersection(demandIntercept, supplyIntercept) {
  const q = (demandIntercept - supplyIntercept) / 2;
  const p = q + supplyIntercept;
  assert.equal(p, demandIntercept - q);
  assert.equal(p, q + supplyIntercept);
  assert(q > 0 && q < 100 && p > 0 && p < 100);
  return { q, p };
}
function equilibrium(point, pointLabel, priceLabel, quantityLabel) {
  return line(0, point.p, point.q, point.p, `stroke="${guide}" stroke-width="2.2" stroke-dasharray="9 8"`)
    + line(point.q, 0, point.q, point.p, `stroke="${guide}" stroke-width="2.2" stroke-dasharray="9 8"`)
    + `<circle cx="${fmt(x(point.q))}" cy="${fmt(y(point.p))}" r="6" fill="${ink}"/>`
    + (pointLabel ? text(x(point.q) + 32, y(point.p) + 8, pointLabel, 25) : "")
    + (priceLabel ? text(x(0) - 15, y(point.p) + 9, priceLabel, 28, "end") : "")
    + (quantityLabel ? text(x(point.q), y(0) + 39, quantityLabel, 28, "middle") : "");
}
function shift(fromQ, toQ, price) {
  return line(fromQ, price, toQ, price, `stroke="${ink}" stroke-width="3" marker-end="url(#arrow)"`);
}
function svg(body, axis = "wheat", title = "Wheat market") {
  const axisTitles = axis === "none" ? "" : axis === "macro"
    ? text(50, 83, "Average price level", 31) + text(1055, 834, "Real GDP", 31, "end")
    : axis === "ppc"
      ? text(50, 83, "Schools", 31) + text(1055, 834, "Clinics", 31, "end")
    : axis === "alternative"
      ? text(50, 83, "Wheat price, Pw", 31) + text(1055, 834, "Wheat quantity, Qw", 31, "end")
      : text(50, 83, "Price of wheat", 31) + text(1055, 834, "Quantity of wheat", 31, "end");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="100%" height="100%" fill="white"/>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 Z" fill="${ink}"/></marker></defs>
<g font-family="Arial, Helvetica, sans-serif" fill="${ink}" stroke-linecap="round" stroke-linejoin="round">
${text(600, 46, title, 31, "middle")}
${line(0, 0, 109, 0, `stroke="${ink}" stroke-width="4" marker-end="url(#arrow)"`)}
${line(0, 0, 0, 104, `stroke="${ink}" stroke-width="4" marker-end="url(#arrow)"`)}
${text(x(0) - 14, y(0) + 29, "0", 26, "end")}${axisTitles}
${body}
</g></svg>`;
}

const e1 = intersection(110, 0), contraction = intersection(110, 30), expansion = intersection(110, -25);
const demandIncrease = intersection(140, 0), demandFall = intersection(85, 0);
assert(contraction.p > e1.p && contraction.q < e1.q);
assert(expansion.p < e1.p && expansion.q > e1.q);
assert(demandIncrease.p > e1.p && demandIncrease.q > e1.q);
assert(demandFall.p < e1.p && demandFall.q < e1.q);
const demand = label => curve(-1, 110, 20, 95, label, 97, 14);
const supply = label => curve(1, 0, 10, 89, label, 91, 90);
const supplyLeft = label => curve(1, 30, 3, 67, label, 68, 98);
const common = (one = e1, two = contraction, labels = ["E1", "E2", "P1", "P2", "Q1", "Q2"]) =>
  equilibrium(one, labels[0], labels[2], labels[4]) + equilibrium(two, labels[1], labels[3], labels[5]);

const fixtures = [
  { name: "wheat-correct", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", supply2: "P=Q+30", e1, e2: contraction },
    source: svg(common() + demand("D") + supply("S1") + supplyLeft("S2") + shift(79, 55, 82)) },
  { name: "wheat-partial", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", e1 },
    source: svg(equilibrium(e1, "E1", "P1", "Q1") + demand("D") + supply("S1")) },
  { name: "wheat-incomplete", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", supply2: "P=Q+30, segment Q=3..30 only", e1 },
    source: svg(equilibrium(e1, "E1", "P1", "Q1") + demand("D") + supply("S1")
      + curve(1, 30, 3, 30, "S2", 31, 62) + shift(42, 19, 46)) },
  { name: "wheat-wrong-direction", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", supply2: "P=Q-25", e1, e2: expansion },
    source: svg(common(e1, expansion) + demand("D") + supply("S1")
      + curve(1, -25, 31, 100, "S2", 100, 80) + shift(70, 87, 65)) },
  { name: "wheat-missing-labels", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", supply2: "P=Q+30", e1, e2: contraction, absent: "axis titles and P/Q projection labels" },
    source: svg(common(e1, contraction, ["E1", "E2", "", "", "", ""]) + demand("D") + supply("S1") + supplyLeft("S2") + shift(79, 55, 82), "none", "") },
  { name: "wheat-demand-increase", question: "econ-v1-2.3-4-001", geometry: { demand1: "P=110-Q", demand2: "P=140-Q", supply: "P=Q", e1, e2: demandIncrease },
    source: svg(common(e1, demandIncrease) + demand("D1") + curve(-1, 140, 45, 100, "D2", 100, 35) + supply("S") + shift(29, 53, 85)) },
  { name: "wheat-alternate-notation", question: "econ-v1-2.3-4-001", geometry: { demand: "P=110-Q", supply1: "P=Q", supply2: "P=Q+30", e1, e2: contraction },
    source: svg(common(e1, contraction, ["E", "E′", "P", "P′", "Q", "Q′"]) + demand("D") + supply("S") + supplyLeft("S′"), "alternative") },
  { name: "essay10-ad-contraction", question: "econ-v1-3.2-10-001", geometry: { demand1: "PL=110-Y", demand2: "PL=85-Y", sras: "PL=Y", e1, e2: demandFall },
    source: svg(common(e1, demandFall, ["E1", "E2", "PL1", "PL2", "Y1", "Y2"]) + demand("AD1")
      + curve(-1, 85, 8, 73, "AD2", 75, 10) + supply("SRAS") + shift(27, 10, 80), "macro", "") },
  { name: "essay15-sras-contraction", question: "econ-v1-3.2-15-002", geometry: { demand: "PL=110-Y", sras1: "PL=Y", sras2: "PL=Y+30", e1, e2: contraction },
    source: svg(common(e1, contraction, ["E1", "E2", "PL1", "PL2", "Y1", "Y2"]) + demand("AD")
      + supply("SRAS1") + supplyLeft("SRAS2") + shift(79, 55, 82), "macro", "") },
  { name: "wheat-irrelevant", question: "econ-v1-2.3-4-001", geometry: { ppc: "Schools=100-Clinics", a: { clinics: 25, schools: 75 }, b: { clinics: 75, schools: 25 } },
    source: svg(equilibrium({ q: 25, p: 75 }, "A", "", "") + equilibrium({ q: 75, p: 25 }, "B", "", "")
      + curve(-1, 100, 0, 100, "PPC", 61, 48), "ppc", "") },
];

await mkdir(output, { recursive: true });
const manifest = [];
for (const fixture of fixtures) {
  const png = await sharp(Buffer.from(fixture.source)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(`${output}/${fixture.name}.svg`, fixture.source);
  await writeFile(`${output}/${fixture.name}.png`, png);
  manifest.push({ filename: `${fixture.name}.png`, source: `${fixture.name}.svg`, question: fixture.question,
    width: WIDTH, height: HEIGHT, sha256: createHash("sha256").update(png).digest("hex"), geometry: fixture.geometry });
}
await writeFile(`${output}/generated-fixtures.json`, JSON.stringify({
  kind: "synthetic engineering evidence; not student work or teacher calibration",
  generator: "scripts/diagram-validation-fixtures.mjs", fixtures: manifest,
}, null, 2) + "\n");

// The contact sheet is for human inspection only. Its filename captions are not
// part of any individual fixture and it must not be submitted as student evidence.
const tileWidth = 420, tileHeight = 360, sheetWidth = tileWidth * 3;
const sheetHeight = 90 + tileHeight * Math.ceil(fixtures.length / 3);
const composite = [{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="90"><rect width="100%" height="100%" fill="white"/><text x="30" y="38" font-family="Arial" font-size="25" fill="${ink}">Synthetic diagram fixture contact sheet</text><text x="30" y="67" font-family="Arial" font-size="18" fill="${ink}">Inspection only — upload individual PNG files as evidence.</text></svg>`), left: 0, top: 0 }];
for (let index = 0; index < fixtures.length; index += 1) {
  const fixture = fixtures[index];
  const thumbnail = await sharp(Buffer.from(fixture.source)).resize(tileWidth, 315).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="45"><rect width="100%" height="100%" fill="white"/><text x="14" y="28" font-family="Arial" font-size="17" fill="${ink}">${escape(fixture.name)}</text></svg>`);
  const left = (index % 3) * tileWidth, top = 90 + Math.floor(index / 3) * tileHeight;
  composite.push({ input: thumbnail, left, top }, { input: label, left, top: top + 315 });
}
await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "white" } })
  .composite(composite).png({ compressionLevel: 9 }).toFile(`${output}/contact-sheet.png`);
console.log(JSON.stringify({ output, fixtures: manifest.map(item => item.filename), contactSheet: "contact-sheet.png", noAssessmentCalls: true }));
