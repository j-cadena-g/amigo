type ScrollWindow = Pick<Window, "scrollX" | "scrollY" | "scrollTo"> & {
  location: Pick<Location, "href">;
};

/**
 * Call when a modal opens; call the returned function when it closes.
 *
 * A modal locks page scroll with `overflow: hidden` on the body, but iOS
 * ignores that when the keyboard opens: it scrolls the page to bring the
 * focused field into view, and the page behind the modal stays scrolled after
 * it closes. Nothing else can scroll the page while the modal is open, so put
 * it back. If the modal closed by navigating, leave scroll to the router.
 */
export function preservePageScroll(win: ScrollWindow = window): () => void {
  const left = win.scrollX;
  const top = win.scrollY;
  const href = win.location.href;

  return () => {
    if (win.location.href !== href) return;
    if (win.scrollX === left && win.scrollY === top) return;
    // "instant" because html has scroll-behavior: smooth.
    win.scrollTo({ left, top, behavior: "instant" });
  };
}
