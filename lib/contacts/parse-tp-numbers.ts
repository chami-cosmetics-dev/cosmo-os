/** Split pasted TP / phone text on commas or newlines; trim + dedupe. */
export function parseTpNumbers(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}
