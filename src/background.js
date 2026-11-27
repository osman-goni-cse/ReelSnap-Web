// ReelSnap Web service worker: saves frames, provides the captureVisibleTab fallback,
// and mirrors the running state on the toolbar badge.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case "rs:save": {
      chrome.downloads.download(
        { url: msg.dataUrl, filename: msg.filename, conflictAction: "uniquify", saveAs: false },
        (id) => {
          const err = chrome.runtime.lastError?.message;
          sendResponse(err ? { ok: false, error: err } : { ok: true, id });
        },
      );
      return true; // async response
    }
    case "rs:captureTab": {
      const windowId = sender.tab?.windowId;
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        const err = chrome.runtime.lastError?.message;
        sendResponse(err ? { ok: false, error: err } : { ok: true, dataUrl });
      });
      return true;
    }
    case "rs:status": {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      const s = msg.status;
      const text = s.state === "running" ? String(s.reels) : s.state === "burst" ? "…" : s.state === "download" ? "REC" : "";
      chrome.action.setBadgeText({ tabId, text });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#E1306C" });
      return;
    }
  }
});
