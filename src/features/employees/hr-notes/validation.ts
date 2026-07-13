import {
  hrNoteCategories,
  type HrNoteActionState,
  type HrNoteCategory,
} from "./types.ts";

export function validateHrNote(formData: FormData): {
  data?: { category: HrNoteCategory; content: string };
  state?: HrNoteActionState;
} {
  const category = String(formData.get("category") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const fieldErrors: Record<string, string> = {};

  if (!hrNoteCategories.includes(category as HrNoteCategory)) {
    fieldErrors.category = "Choose a valid category.";
  }

  if (!content) {
    fieldErrors.content = "Note content is required.";
  } else if (content.length > 5000) {
    fieldErrors.content = "Note content must be 5,000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      state: {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { category },
      },
    };
  }

  return {
    data: {
      category: category as HrNoteCategory,
      content,
    },
  };
}
