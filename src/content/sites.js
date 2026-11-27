// Per-site configuration. When a site changes its UI, this is the file to fix.
(() => {
  const RS = globalThis.RS;

  // Generic "next" buttons: aria-labels like "Next", "Next video", "Go to next video", "Navigate to next Reel".
  const GENERIC_NEXT = /^((go|navigate) to )?next( (video|card|reel|short|post))?$/i;

  RS.SITES = [
    {
      id: "tiktok",
      name: "TikTok",
      short: "tiktok",
      host: /(^|\.)tiktok\.com$/,
      nextSelectors: ['button[data-e2e="feed-navigation-next"]'],
      order: ["key", "button", "scroll"],
    },
    {
      id: "instagram",
      name: "Instagram",
      short: "ig",
      host: /(^|\.)instagram\.com$/,
      nextSelectors: ['[aria-label="Navigate to next Reel"]'],
      order: ["scroll", "key", "button"],
    },
    {
      id: "facebook",
      name: "Facebook",
      short: "fb",
      host: /(^|\.)facebook\.com$/,
      nextSelectors: ['[aria-label="Next card"]', '[aria-label="Next Card"]'],
      order: ["button", "key", "scroll"],
    },
    {
      id: "snapchat",
      name: "Snapchat",
      short: "snap",
      host: /(^|\.)snapchat\.com$/,
      nextSelectors: [],
      order: ["key", "scroll", "button"],
    },
    {
      id: "youtube",
      name: "YouTube Shorts",
      short: "yt",
      host: /(^|\.)youtube\.com$/,
      nextSelectors: ["#navigation-button-down button", 'button[aria-label="Next video"]'],
      order: ["button", "key", "scroll"],
    },
  ];

  RS.detectSite = (hostname = location.hostname) => RS.SITES.find((s) => s.host.test(hostname)) || null;

  RS.findNextButton = (site) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    for (const sel of site.nextSelectors) {
      const el = [...document.querySelectorAll(sel)].find(visible);
      if (el) return el;
    }
    return (
      [...document.querySelectorAll('button[aria-label], [role="button"][aria-label]')].find(
        (el) => GENERIC_NEXT.test(el.getAttribute("aria-label").trim()) && visible(el),
      ) || null
    );
  };
})();
