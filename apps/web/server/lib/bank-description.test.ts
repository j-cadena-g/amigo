import { describe, expect, it } from "vitest";
import { cleanBankDescription } from "./bank-description";

describe("cleanBankDescription", () => {
  it.each([
    ["407-ETR- MOBILE        WOODBRIDGE    ON", "407 ETR Mobile"],
    ["AD FREE FOR PRIMEVIDEO VANCOUVER     BC", "Ad Free For Primevideo"],
    ["AMAZON.CA PRIME MEMBER VANCOUVER     BC", "Amazon.ca Prime Member"],
    ["AMAZON.COM.CA www.amazon.co — www.amazon.co ON", "Amazon.com.ca"],
    ["AMZN Mktp CA*5H6DH4R92 866-216-1072 — 866-216-1072 ON", "AMZN Mktp CA"],
    ["ANTHROPIC* CLAUDE SUB  SAN FRANCISCO CA", "Anthropic Claude Sub"],
    ["APPLE.COM/BILL         TORONTO       ON", "Apple.com/bill"],
    ["BELL MEDIA TORONTO — TORONTO ON", "Bell Media"],
    ["BLUE WATER BRIDGE (CAN POINT EDWARD  ON", "Blue Water Bridge (Can"],
    ["BLUE WATER BRIDGE TOLL PORT HURON    MI", "Blue Water Bridge Toll"],
    ["BURGER BURGER          LONDON        ON", "Burger Burger"],
    ["CANNA CABANA LONDON — LONDON ON", "Canna Cabana"],
    ["CLOUDFLARE CLOUDFLARE.CO — CLOUDFLARE.CO CA", "Cloudflare"],
    ["COSTCO WHOLESALE W530  LONDON        ON", "Costco Wholesale W530"],
    ["DREW'S YIG 7924        LONDON        ON", "Drew's Yig"],
    ["FANTASYPROS FANTASYPROS.C — FANTASYPROS.C CO", "Fantasypros"],
    ["GOOGLE *YOUTUBEPREMIUM HALIFAX       NS", "Google Youtubepremium"],
    ["GOOGLE*WORKSPACE CADEN 650-2530000 — 650-2530000 CA", "Google Workspace Caden"],
    ["GORDIE HOWE INT'L BRID WINDSOR       ON", "Gordie Howe Int'l Brid"],
    ["HOT VILLAS SOLARIS CR TEHUACAN PUE — TEHUACAN PUE", "Hot Villas Solaris CR"],
    ["INSTALLMENT INTEREST 7.99% — 7.99%", "Interest charge"],
    ["MICROSOFT-G185833707   MSBILL.INFO   ON", "Microsoft"],
    ["PAYPAL *DAZN 35314369001 — 35314369001", "Dazn"],
    ["PAYPAL *PLAYSTATION 4029357733 — 4029357733 ON", "Playstation"],
    ["PAYPAL *TIKTOK INC 4029357733 — 4029357733 CA", "TikTok Inc"],
    ["PURCHASE INTEREST 12.99% — 12.99%", "Interest charge"],
    ["RCSS OXFORD #2812      LONDON        ON", "RCSS Oxford"],
    ["REXALL PHARMACY #1727 LONDON — LONDON ON", "Rexall Pharmacy"],
    ["ROGERS ******6746 888-764-3771 — 888-764-3771 ON", "Rogers"],
    ["UBERONE CA/UBERONEMEMB TORONTO — TORONTO ON", "Uberone Ca/uberonememb"],
    ["VENICE.AI VENICE.AI — VENICE.AI WY", "Venice.ai"],
    ["WAL-MART # 3050        LONDON        ON", "Wal-Mart"],
    ["WARP.DEV WARP.DEV — WARP.DEV NY", "Warp.dev"],
    ["X CORP. PAID FEATURES ABOUT.X.COM — ABOUT.X.COM TX", "X Corp. Paid Features"],
  ] as const)("cleans %j", (raw, name) => {
    expect(cleanBankDescription(raw, "en").name).toBe(name);
  });

  it("keeps the uppercase merchant key before display renaming", () => {
    expect(
      cleanBankDescription("RCSS OXFORD #2812      LONDON        ON", "en").merchantKey
    ).toBe("RCSS OXFORD");
    expect(cleanBankDescription("PURCHASE INTEREST 12.99% — 12.99%", "en").merchantKey).toBe(
      "PURCHASE INTEREST"
    );
    expect(
      cleanBankDescription("INSTALLMENT INTEREST 7.99% — 7.99%", "en").merchantKey
    ).toBe("INSTALLMENT INTEREST");
    expect(
      cleanBankDescription("CLOUDFLARE CLOUDFLARE.CO — CLOUDFLARE.CO CA", "en").merchantKey
    ).toBe("CLOUDFLARE");
    expect(
      cleanBankDescription("PAYPAL *TIKTOK INC 4029357733 — 4029357733 CA", "en")
        .merchantKey
    ).toBe("TIKTOK INC");
  });

  it.each([
    ["PURCHASE INTEREST REFUND", "Purchase Interest Refund"],
    ["ANNUAL FEE REVERSAL", "Annual Fee Reversal"],
    ["INTEREST ADJUSTMENT", "Interest Adjustment"],
  ])("does not name a reversed charge as a charge (%s)", (raw, name) => {
    expect(cleanBankDescription(raw, "en").name).toBe(name);
  });

  it("names an interest charge in Spanish without changing the merchant key", () => {
    expect(cleanBankDescription("INSTALLMENT INTEREST 7.99%", "es")).toEqual({
      name: "Cargo por intereses",
      merchantKey: "INSTALLMENT INTEREST",
    });
    expect(cleanBankDescription("ANNUAL FEE", "es")).toEqual({
      name: "Cargo de la tarjeta",
      merchantKey: "ANNUAL FEE",
    });
  });

  it("falls back to the collapsed raw text when cleaning removes everything", () => {
    expect(cleanBankDescription("   650-2530000  ", "en")).toEqual({
      name: "650-2530000",
      merchantKey: "650-2530000",
    });
  });

  it("leaves a readable Wealthsimple description unchanged", () => {
    expect(cleanBankDescription("Interac e-Transfer from John", "en")).toEqual({
      name: "Interac e-Transfer from John",
      merchantKey: "INTERAC E-TRANSFER FROM JOHN",
    });
  });

  it("keeps a memo that adds information", () => {
    expect(cleanBankDescription("STARBUCKS — REWARDS BONUS", "en")).toEqual({
      name: "Starbucks — Rewards Bonus",
      merchantKey: "STARBUCKS — REWARDS BONUS",
    });
  });
});
