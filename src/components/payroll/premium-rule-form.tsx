"use client";

import { useActionState, useMemo, useState } from "react";
import { createPremiumRuleSetAction, updatePremiumRuleSetDraftAction } from "@/app/(dashboard)/payroll/premiums/actions";
import {
  premiumDayTypeValues,
  premiumTimeRoundingModeValues,
  type PremiumDayType,
  type PremiumTimeRoundingMode,
} from "@/features/payroll/constants";
import { premiumDayTypeLabel, premiumTimeRoundingModeLabel } from "@/features/payroll/presentation";
import type { PayrollActionState, PremiumRuleDayInput, PremiumRuleList, PremiumRulePreset, PremiumRuleSet } from "@/features/payroll/types";

const initialState: PayrollActionState = {};
const defaultRule = (dayType: PremiumDayType): PremiumRuleDayInput => ({
  dayType,
  regularTimeMultiplier: 1,
  overtimeMultiplier: dayType === "regular_workday" ? 1.25 : 1.3,
  additionalPremiumOnly: !["rest_day", "special_day_rest_day", "regular_holiday_rest_day", "double_regular_holiday_rest_day"].includes(dayType),
  nightDifferentialPercentage: 0.1,
  nightWindowStart: "22:00",
  nightWindowEnd: "06:00",
  overtimeRoundingMode: "exact_minutes",
  overtimeRoundingIncrementMinutes: null,
  nightRoundingMode: "exact_minutes",
  nightRoundingIncrementMinutes: null,
});

function normalizePresetRule(rule: PremiumRuleDayInput): PremiumRuleDayInput {
  return { ...rule, nightWindowStart: rule.nightWindowStart.slice(0, 5), nightWindowEnd: rule.nightWindowEnd.slice(0, 5) };
}

export function PremiumRuleForm({ data, presetCode, initialRule }: { data: PremiumRuleList; presetCode?: string; initialRule?: PremiumRuleSet }) {
  const preset = useMemo<PremiumRulePreset | undefined>(() => data.presets.find((item) => item.code === presetCode), [data.presets, presetCode]);
  const [state, formAction, pending] = useActionState(async (_: PayrollActionState, formData: FormData) => initialRule ? updatePremiumRuleSetDraftAction(formData) : createPremiumRuleSetAction(formData), initialState);
  const [scope, setScope] = useState<string>(initialRule?.scopeType ?? "company_default");
  const [rules, setRules] = useState<PremiumRuleDayInput[]>(() => premiumDayTypeValues.map((dayType) => normalizePresetRule(initialRule?.dayRules.find((item) => item.dayType === dayType) ?? preset?.dayRules.find((item) => item.dayType === dayType) ?? defaultRule(dayType))));

  function updateRule(index: number, patch: Partial<PremiumRuleDayInput>) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  }

  const serializedRules = JSON.stringify(rules.map((rule) => ({
    day_type: rule.dayType,
    regular_time_multiplier: rule.regularTimeMultiplier,
    overtime_multiplier: rule.overtimeMultiplier,
    additional_premium_only: rule.additionalPremiumOnly,
    night_differential_percentage: rule.nightDifferentialPercentage,
    night_window_start: rule.nightWindowStart,
    night_window_end: rule.nightWindowEnd,
    overtime_rounding_mode: rule.overtimeRoundingMode,
    overtime_rounding_increment_minutes: rule.overtimeRoundingIncrementMinutes,
    night_rounding_mode: rule.nightRoundingMode,
    night_rounding_increment_minutes: rule.nightRoundingIncrementMinutes,
  })));

  return <form className="card content-stack premium-rule-form" action={formAction}>
    <input type="hidden" name="day_rules" value={serializedRules}/>{initialRule ? <><input type="hidden" name="ruleId" value={initialRule.id}/><input type="hidden" name="expectedUpdatedAt" value={initialRule.updatedAt}/></> : null}
    <div className="section-heading"><div><h2>Rule identity</h2><p>New rules remain inactive until a Super Admin approves them.</p></div></div>
    <div className="form-grid">
      <label>Rule name<input className="field" name="name" defaultValue={initialRule?.name ?? preset?.name ?? ""} required maxLength={120}/></label>
      <label>Scope<select className="field" name="scope_type" value={scope} onChange={(event) => setScope(event.target.value)}><option value="company_default">Company default</option><option value="employment_type">Employment type</option><option value="department">Department</option><option value="position">Position</option><option value="payroll_group">Payroll group</option></select></label>
      {scope === "employment_type" ? <label>Employment type<select className="field" name="employment_type" defaultValue={initialRule?.employmentType ?? ""} required><option value="">Choose type</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="probationary">Probationary</option><option value="intern">Intern</option></select></label> : null}
      {scope === "department" ? <label>Department<select className="field" name="department_id" defaultValue={initialRule?.departmentId ?? ""} required><option value="">Choose department</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {scope === "position" ? <label>Position<select className="field" name="position_id" defaultValue={initialRule?.positionId ?? ""} required><option value="">Choose position</option>{data.positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {scope === "payroll_group" ? <label>Payroll group<select className="field" name="payroll_group_id" defaultValue={initialRule?.payrollGroupId ?? ""} required><option value="">Choose payroll group</option>{data.payrollGroups.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label> : null}
      <label>Effective date<input className="field" type="date" name="effective_from" defaultValue={initialRule?.effectiveFrom ?? ""} required/></label>
      <label>End date<input className="field" type="date" name="effective_to" defaultValue={initialRule?.effectiveTo ?? ""}/></label>
      <label className="detail-span">Change reason<textarea className="field" name="change_reason" defaultValue={initialRule?.changeReason ?? ""} required maxLength={1000}/></label>
    </div>
    <div className="section-heading"><div><h2>Legal source</h2><p>Confirm the source before submitting this version.</p></div></div>
    <div className="form-grid">
      <label>Issuing agency<input className="field" name="source_agency" defaultValue={initialRule?.sourceAgency ?? preset?.sourceAgency ?? ""} required maxLength={200}/></label>
      <label>Source reference<input className="field" name="source_reference" defaultValue={initialRule?.sourceReference ?? preset?.sourceReference ?? ""} required maxLength={300}/></label>
      <label>Publication date<input className="field" type="date" name="source_publication_date" defaultValue={initialRule?.sourcePublicationDate ?? preset?.sourcePublicationDate ?? ""} required/></label>
      <label>Source URL<input className="field" type="url" name="source_url" defaultValue={initialRule?.sourceUrl ?? preset?.sourceUrl ?? ""} required/></label>
    </div>
    <div className="section-heading"><div><h2>Day-type matrix</h2><p>Combined day types are explicit. Overtime and night differential use independent rounding rules.</p></div></div>
    <div className="premium-rule-grid">{rules.map((rule, index) => <article className="premium-rule-day-card" key={rule.dayType}>
      <h3>{premiumDayTypeLabel(rule.dayType)}</h3>
      <div className="form-grid compact">
        <label>Day multiplier<input className="field" type="number" min="0.00001" max="10" step="0.00001" value={rule.regularTimeMultiplier} onChange={(event) => updateRule(index, { regularTimeMultiplier: Number(event.target.value) })}/></label>
        <label>OT multiplier<input className="field" type="number" min="0.00001" max="10" step="0.00001" value={rule.overtimeMultiplier} onChange={(event) => updateRule(index, { overtimeMultiplier: Number(event.target.value) })}/></label>
        <label>ND rate (0.10 = 10%)<input className="field" type="number" min="0" max="5" step="0.00001" value={rule.nightDifferentialPercentage} onChange={(event) => updateRule(index, { nightDifferentialPercentage: Number(event.target.value) })}/></label>
        <label>Night starts<input className="field" type="time" value={rule.nightWindowStart} onChange={(event) => updateRule(index, { nightWindowStart: event.target.value })}/></label>
        <label>Night ends<input className="field" type="time" value={rule.nightWindowEnd} onChange={(event) => updateRule(index, { nightWindowEnd: event.target.value })}/></label>
        <label className="checkbox-row"><input type="checkbox" checked={rule.additionalPremiumOnly} onChange={(event) => updateRule(index, { additionalPremiumOnly: event.target.checked })}/>Base pay already included</label>
        <RoundingControl label="Overtime rounding" mode={rule.overtimeRoundingMode} increment={rule.overtimeRoundingIncrementMinutes} onChange={(mode, increment) => updateRule(index, { overtimeRoundingMode: mode, overtimeRoundingIncrementMinutes: increment })}/>
        <RoundingControl label="Night rounding" mode={rule.nightRoundingMode} increment={rule.nightRoundingIncrementMinutes} onChange={(mode, increment) => updateRule(index, { nightRoundingMode: mode, nightRoundingIncrementMinutes: increment })}/>
      </div>
    </article>)}</div>
    {state.error ? <p className="form-error">{state.error}</p> : null}{state.success ? <p className="form-success">{state.success}</p> : null}
    <button className="btn primary" disabled={pending}>{pending ? (initialRule ? "Saving…" : "Creating…") : (initialRule ? "Save draft changes" : "Create inactive draft")}</button>
  </form>;
}

function RoundingControl({ label, mode, increment, onChange }: { label: string; mode: PremiumTimeRoundingMode; increment: number | null; onChange: (mode: PremiumTimeRoundingMode, increment: number | null) => void }) {
  return <div className="rounding-control"><label>{label}<select className="field" value={mode} onChange={(event) => { const next = event.target.value as PremiumTimeRoundingMode; onChange(next, next === "exact_minutes" ? null : increment ?? 15); }}>{premiumTimeRoundingModeValues.map((value) => <option key={value} value={value}>{premiumTimeRoundingModeLabel(value)}</option>)}</select></label>{mode !== "exact_minutes" ? <label>Increment<input className="field" type="number" min="1" max="1440" value={increment ?? 15} onChange={(event) => onChange(mode, Number(event.target.value))}/></label> : null}</div>;
}
