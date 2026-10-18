import { useLayoutEffect } from "react";
import { preservePageScroll } from "@/app/lib/page-scroll";

/**
 * Render inside a modal's content, which mounts only while the modal is open:
 * the page behind it is back where it was when the modal closes.
 */
export function PreservePageScroll() {
  useLayoutEffect(() => preservePageScroll(), []);
  return null;
}
