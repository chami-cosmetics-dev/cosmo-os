"use client";

import { useEffect } from "react";

/**
 * Fetches the company favicon URL and sets it as the browser tab icon.
 * Runs after mount so it works with auth - the favicon updates when the user is logged in.
 */
export function FaviconUpdater() {
  useEffect(() => {
    fetch("/api/me/favicon-url", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { url?: string | null }) => {
        const url = data?.url;
        if (!url || typeof url !== "string") return;

        let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = url;
      })
      .catch(() => {});
  }, []);

  return null;
}
