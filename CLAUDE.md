# ReelSnap Web (Chrome/Edge extension)

Manifest V3 extension, plain JavaScript with **no build step**. It captures frames from short-video feeds
(TikTok, Instagram, Facebook, Snapchat Spotlight, YouTube Shorts) as a burst or an auto loop
(wait → N frames → next reel), and downloads the reel on screen. Offline: no network requests of its own.
Companion Android app: https://github.com/osman-goni-cse/ReelSnap

## Layout
- Content scripts are classic scripts, loaded in manifest order and sharing `globalThis.RS`:
  `util.js` → `sites.js` → `video.js` → `capture.js` → `download.js` → `runner.js`.
- `src/content/sites.js`: per-site next-reel selectors and the order strategies are tried in. Fix this file first
  when a site changes its layout.
- `src/background.js`: `chrome.downloads`, the `captureVisibleTab` fallback, the toolbar badge.
- `popup/`: settings (in `chrome.storage.sync`) and the Start loop / Burst / Download / Stop controls.

## Key behaviour
- Frames come from `drawImage(video)` at native resolution. A tainted canvas (a cross-origin video without CORS,
  e.g. Snapchat's CDN mp4) falls back to `captureVisibleTab` cropped to the video.
- Next reel: try scroll, ArrowDown, or the site's next button in per-site order, confirm the active video changed,
  and remember what worked. Change detection compares element, `currentSrc` **and `srcObject`**, because Facebook
  uses a MediaSourceHandle and leaves `currentSrc` empty.
- Black frames during a reel switch are skipped (`RS.isBlankFrame`).
- A blocking `[role=dialog]` (e.g. logged-out Instagram's login wall) stops the loop with a clear message.
- Download: a plain `https:` source is downloaded as the original file. MSE streams are recorded for one
  play-through with MediaRecorder on `video.captureStream()` (MP4 if supported, else WebM). Recordings over 40 MB
  use a page download instead of extension messaging.

## Verified on live sites (Chrome)
| Site | Next reel | Frames | Download |
|---|---|---|---|
| TikTok | ArrowDown (button `feed-navigation-next` as backup) | canvas | recording |
| YouTube Shorts | "Next video" button | canvas | recording (playable MP4 with audio) |
| Instagram (logged out) | feed scroll | canvas | recording |
| Facebook (logged in) | "Next Card" button | canvas | recording |
| Snapchat Spotlight | ArrowDown / "Next video" | tab-capture fallback | original file |

## Testing
- Browser automation can't open `chrome://extensions`, so the extension can't be loaded that way. Tests so far
  injected the content-script code into a live tab with a stubbed `chrome.*` (saves kept in memory).
  The popup, real downloads, the badge and the `captureVisibleTab` fallback still need the installed extension:
  that's ticket #15.
- Before committing, run `node --check` on every JS file and `python3 -m json.tool manifest.json`.
- Long page scripts hit the automation tool's 45 s limit: start them in the background and poll the result.

## Releases and tracking
- Bump `version` in `manifest.json`. Zip `manifest.json src popup icons LICENSE README.md`, then
  `gh release create vX.Y.Z <zip> -R osman-goni-cse/ReelSnap-Web`. Latest release: v1.1.0.
- Issues use JIRA-style labels (`type: epic|story|feature|task|bug`) and milestones. Epic: #18.
  Board: https://github.com/users/osman-goni-cse/projects/1. Close tickets with `Closes #n` and tick them off in
  the epic's checklist.
- Open: #15 end-to-end test with the installed extension; #16 Instagram while logged in.

## Conventions
- Commit and push only when asked. Commit messages end with the Co-Authored-By line.
- Downloads are for personal use. Keep the ToS note in the README and release notes.
