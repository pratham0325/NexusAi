/** Client-side text extraction for uploaded documents. */

import Papa from "papaparse";

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
];

export const ACCEPT_ATTR =
  ".pdf,.docx,.txt,.md,.csv,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const CHAT_ACCEPT_ATTR =
  `${ACCEPT_ATTR},.png,.jpg,.jpeg,.webp,${IMAGE_TYPES.join(",")}`;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_IMAGE_BYTES = 7 * 1024 * 1024;
export const MAX_CHAT_TEXT_CHARS = 250_000;

export function isSupportedChatDocument(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_TYPES.includes(file.type) ||
    [".pdf", ".docx", ".txt", ".md", ".csv"].some((ext) => name.endsWith(ext))
  );
}

export function isSupportedChatImage(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number]) ||
    [".png", ".jpg", ".jpeg", ".webp"].some((ext) => name.endsWith(ext))
  );
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdf(file);
  }
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return extractDocx(file);
  }
  if (file.type === "text/csv" || name.endsWith(".csv")) {
    const raw = await file.text();
    return csvToText(raw);
  }
  // txt / md / anything text-ish
  return await file.text();
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Vite-friendly worker setup (bundled worker, no CDN).
  const workerUrl = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }
  return pages.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

/** Minimal CSV → readable text (server has its own copy too). */
export function csvToText(raw: string): string {
  const parsed = Papa.parse<string[]>(raw.trim(), { skipEmptyLines: true });
  const rows = (parsed.data as string[][]).filter((r) => r.length > 0);
  if (!rows.length) return "";
  const [header, ...body] = rows;
  const lines: string[] = [
    `CSV with columns: ${header.join(", ")}. ${body.length} rows.`,
    "",
  ];
  const maxRows = Math.min(body.length, 2000);
  for (let i = 0; i < maxRows; i++) {
    const cells = body[i];
    const parts = header.map(
      (h, j) => `${(h ?? `col${j + 1}`).trim()}: ${cells[j] ?? ""}`,
    );
    lines.push(`Row ${i + 1}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
