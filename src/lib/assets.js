import path from "node:path";

export const IMAGE_TYPES = new Map([
  ["image/svg+xml", ".svg"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function assetError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function safeAssetFilename(fileName, contentType, now = Date.now()) {
  const parsed = path.parse(String(fileName || "case-study-image"));
  const baseName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "case-study-image";
  const expectedExtension = IMAGE_TYPES.get(contentType);

  if (!expectedExtension) {
    throw assetError("Unsupported image type. Use SVG, PNG, JPG or WebP.", 415);
  }

  return `${baseName}-${now}${expectedExtension}`;
}

export function assertImageSignature(file, contentType) {
  if (contentType === "image/png") {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!file.subarray(0, 8).equals(pngSignature)) {
      throw assetError("PNG upload does not look like a valid PNG file.", 415);
    }
    return;
  }

  if (contentType === "image/jpeg") {
    if (file[0] !== 0xff || file[1] !== 0xd8 || file[2] !== 0xff) {
      throw assetError("JPG upload does not look like a valid JPG file.", 415);
    }
    return;
  }

  if (contentType === "image/webp") {
    if (file.subarray(0, 4).toString("ascii") !== "RIFF" || file.subarray(8, 12).toString("ascii") !== "WEBP") {
      throw assetError("WebP upload does not look like a valid WebP file.", 415);
    }
    return;
  }

  if (contentType === "image/svg+xml") {
    const svgText = file.toString("utf8", 0, Math.min(file.length, 250_000)).toLowerCase();

    if (!svgText.includes("<svg")) {
      throw assetError("SVG upload does not contain an <svg> element.", 415);
    }

    if (/<script|<foreignobject|\son[a-z]+\s*=|javascript:/i.test(svgText)) {
      throw assetError("SVG upload contains active content and was rejected.", 415);
    }
    return;
  }

  throw assetError("Unsupported image type. Use SVG, PNG, JPG or WebP.", 415);
}
