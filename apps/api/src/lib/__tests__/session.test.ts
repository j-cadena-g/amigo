import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSessionFromCookie } from "../session";
import { createMockSession } from "../../test/utils";

// Mock Redis
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../redis", () => ({
  redis: mockRedis,
}));

describe("Session Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSessionFromCookie", () => {
    it("returns null when cookie header is null", async () => {
      const result = await getSessionFromCookie(null);
      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it("returns null when cookie header is empty", async () => {
      const result = await getSessionFromCookie("");
      expect(result).toBeNull();
    });

    it("returns null when session cookie is not present", async () => {
      const result = await getSessionFromCookie("other_cookie=value");
      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it("returns null when session is not found in Redis", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await getSessionFromCookie("amigo_session=invalid-session-id");

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith("session:invalid-session-id");
    });

    it("returns session data when valid session exists", async () => {
      const mockSession = createMockSession();
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await getSessionFromCookie("amigo_session=valid-session-id");

      expect(result).toEqual({ ...mockSession, sessionId: "valid-session-id" });
      expect(mockRedis.get).toHaveBeenCalledWith("session:valid-session-id");
    });

    it("parses cookies with multiple values correctly", async () => {
      const mockSession = createMockSession();
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await getSessionFromCookie(
        "other=value; amigo_session=my-session; another=test"
      );

      expect(result).toEqual({ ...mockSession, sessionId: "my-session" });
      expect(mockRedis.get).toHaveBeenCalledWith("session:my-session");
    });

    it("handles cookies with spaces correctly", async () => {
      const mockSession = createMockSession();
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await getSessionFromCookie(
        "  amigo_session=trimmed-session  "
      );

      expect(result).toEqual({ ...mockSession, sessionId: "trimmed-session" });
      expect(mockRedis.get).toHaveBeenCalledWith("session:trimmed-session");
    });

    it("handles session values with equals signs", async () => {
      const mockSession = createMockSession();
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      // Some session IDs might contain = characters (base64 encoded)
      const result = await getSessionFromCookie("amigo_session=abc=def=ghi");

      expect(result).toEqual({ ...mockSession, sessionId: "abc=def=ghi" });
      expect(mockRedis.get).toHaveBeenCalledWith("session:abc=def=ghi");
    });

    it("returns all session fields", async () => {
      const mockSession = createMockSession({
        userId: "user-123",
        householdId: "household-456",
        email: "test@example.com",
        name: "Test User",
        authId: "auth-789",
      });
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await getSessionFromCookie("amigo_session=session-id");

      expect(result).toEqual({
        userId: "user-123",
        householdId: "household-456",
        email: "test@example.com",
        name: "Test User",
        authId: "auth-789",
        sessionId: "session-id",
      });
    });

    it("handles session with null name", async () => {
      const mockSession = createMockSession({ name: null });
      mockRedis.get.mockResolvedValue(JSON.stringify(mockSession));

      const result = await getSessionFromCookie("amigo_session=session-id");

      expect(result?.name).toBeNull();
    });
  });
});
