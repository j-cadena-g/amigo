import { describe, expect, it, vi } from "vitest";
import { preservePageScroll } from "./page-scroll";

function fakeWindow(scrollY: number, href = "http://localhost/financial/recurring") {
  const win = {
    scrollX: 0,
    scrollY,
    location: { href },
    scrollTo: vi.fn(),
  };
  return win;
}

describe("preservePageScroll", () => {
  it("puts the page back where it was when the modal opened", () => {
    const win = fakeWindow(120);
    const restore = preservePageScroll(win);

    // The keyboard opened and iOS scrolled the page behind the modal.
    win.scrollY = 540;
    restore();

    expect(win.scrollTo).toHaveBeenCalledWith({ left: 0, top: 120, behavior: "instant" });
  });

  it("does nothing when the page didn't move", () => {
    const win = fakeWindow(120);
    const restore = preservePageScroll(win);

    restore();

    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it("leaves scroll alone when the modal closed by navigating", () => {
    const win = fakeWindow(120);
    const restore = preservePageScroll(win);

    win.location.href = "http://localhost/financial/accounts";
    win.scrollY = 0;
    restore();

    expect(win.scrollTo).not.toHaveBeenCalled();
  });
});
