import { describe, expect, it } from "vitest";
import { buildTransactionalEmailHtml, escapeHtml } from "./transactional-layout";

describe("escapeHtml", () => {
  it("escapes unsafe characters", () => {
    expect(escapeHtml(`<script>"&"</script>`)).toBe("&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;");
  });
});

describe("buildTransactionalEmailHtml", () => {
  it("renders greeting, paragraphs, cta, and otp", () => {
    const html = buildTransactionalEmailHtml({
      greeting: "Jane",
      paragraphs: ["Please sign your agreement."],
      cta: { label: "Open signing page", href: "https://example.com/sign" },
      otp: { code: "123456" },
    });
    expect(html).toContain("Hello Jane");
    expect(html).toContain("Open signing page");
    expect(html).toContain("123456");
    expect(html).toContain("Please sign your agreement.");
  });

  it("renders table rows and warning callout", () => {
    const html = buildTransactionalEmailHtml({
      paragraphs: ["Review the details below."],
      tableRows: [{ label: "Vehicle", value: "<b>AB12 CDE</b>" }],
      callout: { text: "Please correct your submission.", tone: "warning" },
    });
    expect(html).toContain("Vehicle");
    expect(html).toContain("<b>AB12 CDE</b>");
    expect(html).toContain("Please correct your submission.");
  });
});
