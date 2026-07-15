import type { OvertimeSegmentType } from "./types.ts";

export type OvertimeSegmentCandidate = {
  segmentType: OvertimeSegmentType;
  detectedStartAt: string | null;
  detectedEndAt: string | null;
  detectedMinutes: number;
  meetsThreshold: boolean;
};

export type OvertimeDetectionInput = {
  clockInAt: string | null;
  clockOutAt: string | null;
  workedMinutes: number | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  isScheduledWorkday: boolean;
  isHoliday: boolean;
  minimumQualifyingMinutes: number;
};

export function completedWholeMinutes(startIso: string, endIso: string): number {
  return Math.max(
    0,
    Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000),
  );
}

function candidate(
  segmentType: OvertimeSegmentType,
  detectedStartAt: string | null,
  detectedEndAt: string | null,
  detectedMinutes: number,
  minimumQualifyingMinutes: number,
): OvertimeSegmentCandidate {
  return {
    segmentType,
    detectedStartAt,
    detectedEndAt,
    detectedMinutes,
    meetsThreshold: detectedMinutes >= minimumQualifyingMinutes,
  };
}

export function detectOvertimeSegments(
  input: OvertimeDetectionInput,
): OvertimeSegmentCandidate[] {
  if (!input.clockInAt || !input.clockOutAt || input.workedMinutes === null) {
    return [];
  }

  if (input.isHoliday) {
    return input.workedMinutes > 0
      ? [candidate(
          "holiday_work",
          input.clockInAt,
          input.clockOutAt,
          input.workedMinutes,
          input.minimumQualifyingMinutes,
        )]
      : [];
  }

  if (!input.isScheduledWorkday) {
    return input.workedMinutes > 0
      ? [candidate(
          "rest_day",
          input.clockInAt,
          input.clockOutAt,
          input.workedMinutes,
          input.minimumQualifyingMinutes,
        )]
      : [];
  }

  if (!input.scheduledStartAt || !input.scheduledEndAt) return [];

  const segments: OvertimeSegmentCandidate[] = [];
  const preShift = completedWholeMinutes(input.clockInAt, input.scheduledStartAt);
  const postShift = completedWholeMinutes(input.scheduledEndAt, input.clockOutAt);

  if (new Date(input.clockInAt) < new Date(input.scheduledStartAt) && preShift > 0) {
    segments.push(candidate(
      "pre_shift",
      input.clockInAt,
      input.scheduledStartAt,
      preShift,
      input.minimumQualifyingMinutes,
    ));
  }
  if (new Date(input.clockOutAt) > new Date(input.scheduledEndAt) && postShift > 0) {
    segments.push(candidate(
      "post_shift",
      input.scheduledEndAt,
      input.clockOutAt,
      postShift,
      input.minimumQualifyingMinutes,
    ));
  }

  return segments;
}
