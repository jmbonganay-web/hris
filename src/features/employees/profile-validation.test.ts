import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAvatarFile,
  validateEmergencyContact,
  validatePersonalDetails,
} from "./profile-validation.ts";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

test("personal details rejects an invalid personal email", () => {
  const result = validatePersonalDetails(form({ personal_email: "not-an-email" }));
  assert.equal(result.state?.fieldErrors?.personal_email, "Enter a valid personal email.");
});

test("emergency contact requires name, relationship, and phone", () => {
  const result = validateEmergencyContact(form({ full_name: "", relationship: "", phone: "" }));
  assert.deepEqual(result.state?.fieldErrors, {
    full_name: "Contact name is required.",
    relationship: "Relationship is required.",
    phone: "Phone number is required.",
  });
});

test("avatar validation accepts a webp image under five megabytes", () => {
  const file = new File([new Uint8Array(1024)], "avatar.webp", { type: "image/webp" });
  assert.deepEqual(validateAvatarFile(file), { extension: "webp" });
});

test("avatar validation rejects unsupported files", () => {
  const file = new File(["not-an-image"], "avatar.txt", { type: "text/plain" });
  assert.equal(validateAvatarFile(file).error, "Upload a JPG, PNG, or WebP image.");
});
