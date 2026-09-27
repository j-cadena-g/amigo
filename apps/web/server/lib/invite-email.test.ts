import { describe, expect, it } from "vitest";
import { buildInviteEmailContent } from "./invite-email";

const base = {
  householdName: "Casa <Ríos>",
  inviterName: "Ana",
  code: "AMIGO-ABC123",
  joinUrl: "https://app.example.test/join/AMIGO-ABC123",
  expiresAt: new Date("2026-10-04T12:00:00Z"),
};

describe("buildInviteEmailContent", () => {
  it("writes English by default with a readable expiry", () => {
    const email = buildInviteEmailContent(base);
    expect(email.subject).toBe("Join Casa <Ríos> on Amigo");
    expect(email.text).toContain("Ana invited you to join Casa <Ríos> on Amigo.");
    expect(email.text).toContain("Invite code: AMIGO-ABC123");
    expect(email.text).toMatch(/Expires: October 4, 2026.*12:00.*UTC/);
  });

  it("writes Spanish with a Spanish date", () => {
    const email = buildInviteEmailContent({ ...base, language: "es", locale: "es-CO" });
    expect(email.subject).toBe("Únete a Casa <Ríos> en Amigo");
    expect(email.text).toContain("Ana te invitó a unirte a Casa <Ríos> en Amigo.");
    expect(email.text).toContain("Código de invitación: AMIGO-ABC123");
    expect(email.text).toMatch(/Vence: 4 de octubre de 2026.*12:00.*UTC/);
    expect(email.html).toContain(">Aceptar invitación</a>");
  });

  it("escapes names in the HTML part", () => {
    const email = buildInviteEmailContent({ ...base, language: "es" });
    expect(email.html).toContain("<strong>Casa &lt;Ríos&gt;</strong>");
    expect(email.html).not.toContain("<Ríos>");
  });
});
