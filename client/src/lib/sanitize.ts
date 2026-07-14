import DOMPurify from "dompurify";

// Inbound-email HTML is fully untrusted, so every path that renders it must run
// it through here first. DOMPurify's defaults already strip <script>, inline
// event handlers, and `javascript:`/`data:` URLs; on top of that we harden any
// surviving links so they open in a new tab without leaking the opener window.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

// Sanitize an untrusted HTML string into markup safe to pass to
// dangerouslySetInnerHTML. Returns a string of clean HTML (XSS vectors removed).
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty);
}
