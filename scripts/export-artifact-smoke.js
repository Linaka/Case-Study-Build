import fs from "node:fs/promises";
import path from "node:path";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pngDimensions(file) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert(file.subarray(0, 8).equals(signature), "PNG file does not have a valid signature.");

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20)
  };
}

async function readExport(fileName) {
  return fs.readFile(path.join(process.cwd(), "exports", fileName));
}

const files = {
  casePdf: await readExport("uber-sample.pdf"),
  bdPdf: await readExport("enterprise-build-support-bd.pdf"),
  xlsx: await readExport("uber-sample-impact.xlsx"),
  caseBanner: await readExport("uber-sample-marketing-banner.png"),
  bdBanner: await readExport("enterprise-build-support-bd-marketing-banner.png")
};

assert(files.casePdf.subarray(0, 4).toString("ascii") === "%PDF", "Case-study PDF was not a PDF.");
assert(files.bdPdf.subarray(0, 4).toString("ascii") === "%PDF", "BD PDF was not a PDF.");
assert(files.xlsx.subarray(0, 2).toString("ascii") === "PK", "Excel export was not an XLSX zip.");

for (const [name, file] of Object.entries({
  caseBanner: files.caseBanner,
  bdBanner: files.bdBanner
})) {
  const dimensions = pngDimensions(file);

  assert(dimensions.width === 1600, `${name} width was ${dimensions.width}, expected 1600.`);
  assert(dimensions.height === 900, `${name} height was ${dimensions.height}, expected 900.`);
}

console.log("Export artifact smoke passed: PDFs, XLSX and 1600x900 banner PNGs are valid.");
