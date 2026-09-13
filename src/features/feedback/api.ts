import { invoke } from "@tauri-apps/api/core";

export const feedbackCategories = {
  bug: "Report a bug",
  feature: "Suggest a feature",
  general: "General feedback",
} as const;

export type FeedbackCategory = keyof typeof feedbackCategories;

export const isFeedbackCategory = (
  value: string | null,
): value is FeedbackCategory => value != null && value in feedbackCategories;

/** `none` sends no address at all; the other two are a request for a reply. */
export type ContactPreference = "none" | "reply" | "updates";

export interface FeedbackDraft {
  category: FeedbackCategory;
  message: string;
  email?: string;
  contactPreference: ContactPreference;
}

/** Exactly what a submission will contain, so the dialog can show it first. */
export interface FeedbackPreview {
  message: string;
  redacted: boolean;
  contactEmail: string | null;
  appVersion: string;
  platform: string;
  releaseChannel: string;
}

export interface FeedbackReceipt {
  reportId: string;
}

/**
 * Rust owns validation, redaction and transport. The webview deliberately has
 * no network path of its own here, so these two commands are the whole surface.
 */
export const previewFeedback = (draft: FeedbackDraft) =>
  invoke<FeedbackPreview>("preview-feedback", { draft });

export const submitFeedback = (draft: FeedbackDraft) =>
  invoke<FeedbackReceipt>("submit-feedback", { draft });

/** Tauri rejects with whatever the command returned in `Err`, always a string. */
export const feedbackErrorMessage = (error: unknown): string =>
  typeof error === "string" && error.trim()
    ? error
    : "Something went wrong sending that. Try again shortly.";
