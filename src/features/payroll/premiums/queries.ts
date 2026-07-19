import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  normalizeAttendanceDeductionRuleList,
  normalizePremiumApprovalQueue,
  normalizePremiumCoveragePreview,
  normalizePremiumRuleList,
  normalizePremiumRuleSet,
} from "../normalize.ts";
import type {
  AttendanceDeductionRule,
  PremiumApprovalQueue,
  PremiumCoveragePreview,
  PremiumRuleList,
  PremiumRuleSet,
} from "../types.ts";

export async function listPremiumRuleSets(): Promise<PremiumRuleList> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_premium_rule_sets");
  if (error) throw new Error("Unable to load premium rules.");
  return normalizePremiumRuleList(data);
}

export async function getPremiumRuleSetDetail(ruleSetId: string): Promise<PremiumRuleSet | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_premium_rule_set_detail", {
    p_rule_set_id: ruleSetId,
  });
  if (error) throw new Error("Unable to load the premium rule.");
  return normalizePremiumRuleSet(data);
}

export async function listAttendanceDeductionRules(): Promise<AttendanceDeductionRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_attendance_deduction_rules");
  if (error) throw new Error("Unable to load attendance deduction rules.");
  return normalizeAttendanceDeductionRuleList(data);
}

export async function listPremiumRuleApprovals(): Promise<PremiumApprovalQueue> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_premium_rule_approvals");
  if (error) throw new Error("Unable to load premium approvals.");
  return normalizePremiumApprovalQueue(data);
}

export async function previewPremiumRuleCoverage(ruleSetId: string): Promise<PremiumCoveragePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_premium_rule_coverage", {
    p_rule_set_id: ruleSetId,
  });
  if (error) throw new Error("Unable to preview premium-rule coverage.");
  return normalizePremiumCoveragePreview(data);
}
