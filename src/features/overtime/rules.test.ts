import test from "node:test";
import assert from "node:assert/strict";
import {
  completedWholeMinutes,
  detectOvertimeSegments,
} from "./rules.ts";

test("whole-minute precision truncates seconds", () => {
  assert.equal(
    completedWholeMinutes(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T00:29:59.999Z",
    ),
    29,
  );
  assert.equal(
    completedWholeMinutes(
      "2026-07-15T00:00:00.000Z",
      "2026-07-15T00:30:00.000Z",
    ),
    30,
  );
});

test("pre-shift and post-shift thresholds are independent", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:40:00.000Z",
    clockOutAt: "2026-07-15T09:20:00.000Z",
    workedMinutes: 480,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.deepEqual(
    segments.map((segment) => [segment.segmentType, segment.detectedMinutes, segment.meetsThreshold]),
    [
      ["pre_shift", 20, false],
      ["post_shift", 20, false],
    ],
  );
});

test("all detected minutes qualify when a segment reaches threshold", () => {
  const [segment] = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:25:00.000Z",
    clockOutAt: "2026-07-15T09:00:00.000Z",
    workedMinutes: 480,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.equal(segment.segmentType, "pre_shift");
  assert.equal(segment.detectedMinutes, 35);
  assert.equal(segment.meetsThreshold, true);
});

test("holiday work suppresses rest-day and scheduled segments", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: "2026-07-15T08:00:00.000Z",
    workedMinutes: 450,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T07:00:00.000Z",
    isScheduledWorkday: false,
    isHoliday: true,
    minimumQualifyingMinutes: 30,
  });
  assert.deepEqual(segments, [{
    segmentType: "holiday_work",
    detectedStartAt: "2026-07-15T00:00:00.000Z",
    detectedEndAt: "2026-07-15T08:00:00.000Z",
    detectedMinutes: 450,
    meetsThreshold: true,
  }]);
});

test("rest-day overtime uses finalized worked minutes", () => {
  const segments = detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: "2026-07-15T04:30:00.000Z",
    workedMinutes: 240,
    scheduledStartAt: null,
    scheduledEndAt: null,
    isScheduledWorkday: false,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  });
  assert.equal(segments[0].segmentType, "rest_day");
  assert.equal(segments[0].detectedMinutes, 240);
});

test("incomplete attendance produces no segments", () => {
  assert.deepEqual(detectOvertimeSegments({
    clockInAt: "2026-07-15T00:00:00.000Z",
    clockOutAt: null,
    workedMinutes: null,
    scheduledStartAt: "2026-07-15T01:00:00.000Z",
    scheduledEndAt: "2026-07-15T09:00:00.000Z",
    isScheduledWorkday: true,
    isHoliday: false,
    minimumQualifyingMinutes: 30,
  }), []);
});
