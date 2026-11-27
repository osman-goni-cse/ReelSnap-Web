# ReelSnap Web

A Chrome/Edge extension (Manifest V3) that captures frames from short-video feeds on
**TikTok, Instagram Reels, Facebook Reels, Snapchat Spotlight and YouTube Shorts**.
It's the browser companion to the [ReelSnap Android app](https://github.com/osman-goni-cse/ReelSnap).

- **Burst:** grab N frames, with a gap between them, from the video on screen.
- **Auto loop:** wait → N frames → go to the next reel → repeat, until you press Stop or hit a reel/time limit.
- **Download:** save the reel on screen to `Downloads/ReelSnap/downloads/`. A video with a plain file URL (Snapchat) is
  downloaded as the original file. Streamed videos (TikTok, Instagram, Facebook, YouTube) have no file to fetch, so they
  are recorded in real time for one play-through (MP4 when Chrome supports it, otherwise WebM). Press Stop to keep a
  partial recording.
- Frames are taken from the `<video>` element at its **native resolution**, so no buttons or captions are in the shot.
- Saved to `Downloads/ReelSnap/<session>/<site>_r0001_s01.png`.
- Fully offline: no network requests, no analytics, plain JavaScript with no build step.

## Install
1. Download `ReelSnap-Web-v*.zip` from [Releases](../../releases) and unzip it, or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Reload any already-open TikTok/Instagram/Facebook/Snapchat/YouTube tabs.

To avoid a "Save as" dialog for every frame, turn off *Ask where to save each file* in Chrome's download settings.

## Use
Open a reels feed, click the ReelSnap toolbar icon, adjust the settings and press **Start loop** or **Burst**.
The badge on the icon shows how many reels have been done. **Keep the tab visible** while looping: background tabs pause video and throttle timers.

| Setting | Default |
|---|---|
| Wait before capture | 2 s |
| Frames per reel | 1 |
| Gap between frames | 2 s |
| Random jitter (±20%) | on |
| Stop after reels / minutes | 0 = never |
| Format | PNG (or JPEG q92) |

## How it works
| File | Role |
|---|---|
| `src/content/video.js` | picks the most visible playing `<video>` and detects when it changes |
| `src/content/capture.js` | `drawImage(video)` → OffscreenCanvas → PNG/JPEG. If the canvas is tainted (a cross-origin video without CORS), it falls back to `captureVisibleTab` cropped to the video |
| `src/content/sites.js` | per-site config: how to get to the next reel |
| `src/content/download.js` | direct file download, or `MediaRecorder` on `video.captureStream()` |
| `src/content/runner.js` | loop/burst/download state machine and limits |
| `src/background.js` | `chrome.downloads`, the tab-capture fallback, the toolbar badge |
| `popup/` | settings and controls |

**Next reel:** each site tries, in its own order, a scroll of the feed container, an `ArrowDown` key event, and a click on the site's "next" button. It confirms the active video actually changed before moving on, then remembers whichever method worked. When a site changes its layout, `src/content/sites.js` is the file to update.

## Tested sites
| Site | Next reel | Frames | Download |
|---|---|---|---|
| TikTok | ArrowDown key | video canvas | recording |
| YouTube Shorts | "Next video" button | video canvas | recording (verified: playable MP4 with audio) |
| Instagram Reels | feed scroll | video canvas | recording |
| Facebook Reels | "Next Card" button | video canvas | recording |
| Snapchat Spotlight | ArrowDown key / "Next video" button | tab-capture fallback (CDN video has no CORS) | original file |

Logged-out Instagram shows a login wall after a few reels; the loop stops and says so.

## Notes
- Respect creators and each platform's terms. This is meant for personal use.

## License
MIT
