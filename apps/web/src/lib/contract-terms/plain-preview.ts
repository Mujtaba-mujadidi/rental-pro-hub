/** Strip HTML for table previews and search (no DOM). */
export function stripTagsToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncatePreview(plain: string, max = 120): string {
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1)}…`;
}
