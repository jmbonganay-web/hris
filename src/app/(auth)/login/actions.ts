"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "Email and password are required.",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Supabase login error:", {
      message: error.message,
      code: error.code,
      status: error.status,
    });

    return {
      error:
        process.env.NODE_ENV === "development"
          ? `${error.message}${error.code ? ` (${error.code})` : ""}`
          : "The email or password is incorrect.",
    };
  }

  redirect("/dashboard");
}