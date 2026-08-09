import { describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "./email";

describe("sendTransactionalEmail", () => {
  it("sends from invites@mail.mi-amigo.com", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "msg_1" });
    const result = await sendTransactionalEmail(
      { send },
      {
        to: "friend@example.com",
        subject: "Join my household on Amigo",
        text: "plain",
        html: "<p>html</p>",
      }
    );
    expect(result.messageId).toBe("msg_1");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "friend@example.com",
        from: { email: "invites@mail.mi-amigo.com", name: "Amigo" },
      })
    );
  });
});
