import test from "node:test";
import assert from "node:assert/strict";
import { buildTrendPolyline } from "./chart.ts";

test("trend geometry scales values into a deterministic SVG viewport", () => {
  assert.equal(buildTrendPolyline([0, 5, 10], 200, 100, 10), "10,90 100,50 190,10");
});

test("trend geometry handles empty and flat series", () => {
  assert.equal(buildTrendPolyline([], 200, 100, 10), "");
  assert.equal(buildTrendPolyline([3], 200, 100, 10), "100,50");
  assert.equal(buildTrendPolyline([3, 3], 200, 100, 10), "10,50 190,50");
});
