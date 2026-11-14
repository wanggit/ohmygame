/** Structured output of the independent game visual review (game_review). */

export type GameVisualReviewSeverity = "blocker" | "major" | "minor";

export type GameVisualReviewArea =
  | "blank-frame"
  | "layout"
  | "hud"
  | "readability"
  | "style"
  | "asset-quality"
  | "responsiveness"
  | "other";

export interface GameVisualReviewIssue {
  severity: GameVisualReviewSeverity;
  area: GameVisualReviewArea;
  /** Screenshot label or asset path the issue is visible on. */
  where: string;
  description: string;
  suggestion?: string;
}

export type GameVisualReviewVerdict = "pass" | "needs-work" | "reject";

export interface GameVisualReviewReport {
  verdict: GameVisualReviewVerdict;
  summary: string;
  issues: GameVisualReviewIssue[];
  screenshotsReviewed: number;
  assetsReviewed: number;
  model: { provider: string; id: string };
}

const SEVERITIES: readonly GameVisualReviewSeverity[] = ["blocker", "major", "minor"];
const AREAS: readonly GameVisualReviewArea[] = ["blank-frame", "layout", "hud", "readability", "style", "asset-quality", "responsiveness", "other"];

/** Text form for the agent conversation; the report itself stays structured in details. */
export function formatGameVisualReview(report: GameVisualReviewReport, notes: readonly string[] = []): string {
  const lines = [
    `Independent visual review (${report.model.provider}/${report.model.id}) — verdict: ${report.verdict} — ${report.screenshotsReviewed} screenshot(s), ${report.assetsReviewed} asset(s).`,
    report.summary.trim(),
  ];
  if (report.issues.length) {
    lines.push("", "Issues:");
    for (const issue of report.issues) {
      const suggestion = issue.suggestion?.trim();
      lines.push(`- [${issue.severity}] ${issue.area} — ${issue.where}: ${issue.description.trim()}${suggestion ? ` → ${suggestion}` : ""}`);
    }
  } else {
    lines.push("", "No visual issues reported.");
  }
  if (notes.length) {
    lines.push("", "Review evidence notes:");
    for (const note of notes) lines.push(`- ${note}`);
  }
  return lines.join("\n");
}

function normalizeIssue(value: unknown): GameVisualReviewIssue | undefined {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!description) return;
  const severity = SEVERITIES.includes(record.severity as GameVisualReviewSeverity) ? record.severity as GameVisualReviewSeverity : "minor";
  const area = AREAS.includes(record.area as GameVisualReviewArea) ? record.area as GameVisualReviewArea : "other";
  const where = typeof record.where === "string" && record.where.trim() ? record.where.trim() : "unspecified";
  const suggestion = typeof record.suggestion === "string" && record.suggestion.trim() ? record.suggestion.trim() : undefined;
  return { severity, area, where, description, ...(suggestion ? { suggestion } : {}) };
}

/** Parses the reviewer's reply, tolerating code fences and commentary around the JSON object. */
export function parseGameVisualReview(text: string): { verdict: GameVisualReviewVerdict; summary: string; issues: GameVisualReviewIssue[] } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The review model did not return a JSON report");
  let parsed: unknown;
  try { parsed = JSON.parse(candidate.slice(start, end + 1)); }
  catch { throw new Error("The review model returned a malformed JSON report"); }
  if (!parsed || typeof parsed !== "object") throw new Error("The review model returned a malformed JSON report");
  const record = parsed as Record<string, unknown>;
  const verdict = record.verdict === "pass" || record.verdict === "needs-work" || record.verdict === "reject" ? record.verdict : undefined;
  if (!verdict) throw new Error("The review report is missing a verdict");
  const summary = typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : "The review model returned no summary.";
  const issues = Array.isArray(record.issues) ? record.issues.map(normalizeIssue).filter((issue): issue is GameVisualReviewIssue => !!issue) : [];
  return { verdict, summary, issues };
}