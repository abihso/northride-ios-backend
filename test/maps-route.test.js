import assert from "node:assert/strict";
import test from "node:test";
import { googleRequest } from "../src/routes/mapsRoute.js";

const googleResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("Places autocomplete treats ZERO_RESULTS as a successful empty search", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => googleResponse({ status: "ZERO_RESULTS" });
  try {
    const result = await googleRequest(
      new URL("https://maps.googleapis.com/"),
      "Places Autocomplete",
      true,
    );
    assert.equal(result.status, "ZERO_RESULTS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Maps API failures report provider status and setup guidance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    googleResponse({ status: "REQUEST_DENIED" });
  try {
    await assert.rejects(
      googleRequest(new URL("https://maps.googleapis.com/"), "Places Autocomplete"),
      /Google Places Autocomplete failed \(REQUEST_DENIED\).*API is enabled.*billing is active.*server key is valid/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Maps API quota failures report quota and billing guidance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    googleResponse({ status: "OVER_QUERY_LIMIT" });
  try {
    await assert.rejects(
      googleRequest(new URL("https://maps.googleapis.com/"), "Places Autocomplete"),
      /Google Places Autocomplete failed \(OVER_QUERY_LIMIT\).*quota and billing/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Directions ZERO_RESULTS explains that the selected points are not routable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    googleResponse({ status: "ZERO_RESULTS" });
  try {
    await assert.rejects(
      googleRequest(new URL("https://maps.googleapis.com/"), "Directions"),
      (error) => {
        assert.equal(error.status, 422);
        assert.match(error.message, /could not find a drivable route/);
        assert.match(error.message, /nearby delivery address/);
        assert.match(error.message, /shop's map coordinates/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
