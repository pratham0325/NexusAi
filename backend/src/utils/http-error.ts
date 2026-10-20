/** Custom HTTP error carrying status + machine code for the error envelope. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Formats a zod error into a human-readable single-line message. */
export function formatZodError(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
    .join("; ");
}
