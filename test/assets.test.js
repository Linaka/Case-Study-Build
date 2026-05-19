import assert from "node:assert/strict";
import test from "node:test";

import { assertImageSignature, safeAssetFilename } from "../src/lib/assets.js";

test("safeAssetFilename sanitizes names and uses content-type extensions", () => {
  assert.equal(
    safeAssetFilename("../Hero Image!.jpeg", "image/png", 123),
    "hero-image-123.png"
  );
});

test("assertImageSignature accepts safe SVG content", () => {
  const file = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');

  assert.doesNotThrow(() => assertImageSignature(file, "image/svg+xml"));
});

test("assertImageSignature rejects active SVG content", () => {
  const file = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  assert.throws(
    () => assertImageSignature(file, "image/svg+xml"),
    /active content/
  );
});

test("assertImageSignature rejects spoofed PNG uploads", () => {
  const file = Buffer.from("not really a png");

  assert.throws(
    () => assertImageSignature(file, "image/png"),
    /valid PNG/
  );
});
