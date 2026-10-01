/** Decode legacy bank downloads before sending their text to the import endpoint. */
export function decodeOfxFile(bytes: ArrayBuffer): string {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 1024));
  const charset = /CHARSET:\s*([^\s]+)/i.exec(header)?.[1]?.toUpperCase();
  const encoding = /ENCODING:\s*([^\s]+)/i.exec(header)?.[1]?.toUpperCase();
  const decoder =
    encoding === "UTF-8" ||
    encoding === "UNICODE" ||
    charset === "65001" ||
    !encoding
      ? "utf-8"
      : encoding === "USASCII" &&
          (charset === "1252" ||
            charset === "8859-1" ||
            charset === "ISO-8859-1" ||
            charset === "NONE")
        ? "windows-1252"
        : null;
  if (!decoder) throw new Error("Unsupported OFX encoding.");
  return new TextDecoder(decoder, { fatal: true }).decode(bytes);
}
