import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv/parse-csv";

describe("parseCsv", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCsv("a,b\n1,2\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted commas and escaped quotes", () => {
    const { rows } = parseCsv('name,note\n"Smith, J","He said ""hi"""\n');
    expect(rows[0]).toEqual(["Smith, J", 'He said "hi"']);
  });

  it("returns empty for blank input", () => {
    expect(parseCsv("").headers).toEqual([]);
    expect(parseCsv("").rows).toEqual([]);
  });
});

describe("toCsv", () => {
  it("round-trips simple values and quotes commas", () => {
    const text = toCsv(["a", "b"], [["1", "x,y"], [null, undefined]]);
    expect(text).toContain('"x,y"');
    const parsed = parseCsv(text);
    expect(parsed.headers).toEqual(["a", "b"]);
    expect(parsed.rows[0]).toEqual(["1", "x,y"]);
  });
});
