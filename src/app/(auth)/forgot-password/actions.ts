"use server";

import { createClient } from "@/lib/supabase/server";

export type ResetRequestState = { error?: string; success?: string };

export async function requestPasswordReset(
  _previousState: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: "Unable to send the reset email. Try again." };
  return { success: "Check your email for a password reset link." };
}
