import { describe, expect, it } from "vitest";
import { decodeOfxFile } from "./ofx-file";

describe("OFX file decoding", () => {
  it("decodes NBC Windows-1252 accents without replacement characters", () => {
    const header = new TextEncoder().encode(
      "ENCODING:USASCII\r\nCHARSET:1252\r\n<OFX><NAME>Caf"
    );
    const bytes = new Uint8Array([...header, 0xe9]);
    expect(decodeOfxFile(bytes.buffer)).toContain("Café");
  });
  it("decodes UTF-8 files", () => {
    expect(
      decodeOfxFile(
        new TextEncoder().encode("ENCODING:UTF-8\n<OFX>Café").buffer
      )
    ).toContain("Café");
  });
  it("rejects unsupported encodings and invalid UTF-8", () => {
    expect(() =>
      decodeOfxFile(
        new TextEncoder().encode("ENCODING:UNICODE\nCHARSET:999").buffer
      )
    ).toThrow();
    expect(() => decodeOfxFile(new Uint8Array([0xff]).buffer)).toThrow();
  });
});
