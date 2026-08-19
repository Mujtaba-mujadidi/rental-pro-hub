import { describe, expect, it } from "vitest";
import {
  formatAuditActorLabel,
  hireAuditActorRoleLabel,
  pickAuditActorDisplayName,
} from "@/lib/fleet/hire-audit";

describe("pickAuditActorDisplayName", () => {
  it("prefers a real profile name over placeholders and email", () => {
    expect(
      pickAuditActorDisplayName({
        profileDisplayName: "Mujtaba Ghulamfarooq",
        email: "mujtaba@example.com",
      }),
    ).toBe("Mujtaba Ghulamfarooq");
  });

  it("ignores invite placeholders and falls back to auth metadata then email", () => {
    expect(
      pickAuditActorDisplayName({
        profileDisplayName: "Company user",
        metadataFirstName: "Riddhi",
        metadataLastName: "Joshi",
        email: "riddhi@example.com",
      }),
    ).toBe("Riddhi Joshi");
    expect(
      pickAuditActorDisplayName({
        profileDisplayName: "Company staff",
        email: "ops.user@example.com",
      }),
    ).toBe("ops user");
  });
});

describe("formatAuditActorLabel", () => {
  it("shows the person name with their role", () => {
    expect(formatAuditActorLabel("Mujtaba Ghulamfarooq", "company_staff")).toBe(
      "Mujtaba Ghulamfarooq · Company staff",
    );
    expect(formatAuditActorLabel(null, "company_staff")).toBe("Company staff");
    expect(hireAuditActorRoleLabel("driver")).toBe("Driver");
  });
});
