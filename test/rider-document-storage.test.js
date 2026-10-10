import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { isSupportedDocumentImage } from "../src/services/riderDocumentStorage.js";

test("document image validation accepts supported image signatures", () => {
  assert.equal(
    isSupportedDocumentImage("image/jpeg", Buffer.from([0xff, 0xd8, 0xff])),
    true,
  );
  assert.equal(
    isSupportedDocumentImage(
      "image/png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    true,
  );
  assert.equal(
    isSupportedDocumentImage(
      "image/webp",
      Buffer.from("RIFFxxxxWEBP", "ascii"),
    ),
    true,
  );
});

test("document image validation rejects content-type spoofing and unsupported formats", () => {
  assert.equal(
    isSupportedDocumentImage("image/jpeg", Buffer.from("<html>")),
    false,
  );
  assert.equal(
    isSupportedDocumentImage("image/svg+xml", Buffer.from("<svg/>")),
    false,
  );
});
