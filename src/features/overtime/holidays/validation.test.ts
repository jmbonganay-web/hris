import test from "node:test";
import assert from "node:assert/strict";
import {
  validateHolidayCreate,
  validateHolidayReplacement,
} from "./validation.ts";

function createForm(
  date: string,
  name: string,
  type: string,
  reason = "",
) {
  const data = new FormData();
  data.set("holiday_date", date);
  data.set("holiday_name", name);
  data.set("holiday_type", type);
  data.set("change_reason", reason);
  return data;
}

test("holiday creation accepts all approved holiday types", () => {
  for (const type of [
    "regular_holiday",
    "special_non_working_holiday",
    "company_holiday",
  ]) {
    assert.equal(
      validateHolidayCreate(
        createForm("2026-07-16", "Holiday", type),
        "2026-07-15",
      ).data?.holidayType,
      type,
    );
  }
});

test("current and past holiday creation requires a reason", () => {
  assert.equal(
    validateHolidayCreate(
      createForm("2026-07-15", "Holiday", "company_holiday"),
      "2026-07-15",
    ).data,
    undefined,
  );
  assert.equal(
    validateHolidayCreate(
      createForm("2026-07-15", "Holiday", "company_holiday", "Company event"),
      "2026-07-15",
    ).data?.changeReason,
    "Company event",
  );
});

test("replacement validates concurrency, active state, and date-sensitive reason", () => {
  const invalid = new FormData();
  assert.equal(validateHolidayReplacement(invalid, "2026-07-15").data, undefined);

  const future = createForm(
    "2026-07-20",
    "Replacement Holiday",
    "regular_holiday",
  );
  future.set("expected_active_version_id", "11111111-1111-4111-8111-111111111111");
  future.set("is_active", "false");
  assert.equal(validateHolidayReplacement(future, "2026-07-15").data?.isActive, false);

  const current = createForm(
    "2026-07-15",
    "Replacement Holiday",
    "regular_holiday",
  );
  current.set("expected_active_version_id", "11111111-1111-4111-8111-111111111111");
  current.set("is_active", "true");
  assert.equal(validateHolidayReplacement(current, "2026-07-15").data, undefined);
});

test("private holiday reasons are never returned in retry state", () => {
  const sentinel = "PRIVATE_HOLIDAY_REASON";
  const result = validateHolidayCreate(
    createForm("", "Holiday", "company_holiday", sentinel),
    "2026-07-15",
  );
  assert.doesNotMatch(JSON.stringify(result.state), new RegExp(sentinel));
});
