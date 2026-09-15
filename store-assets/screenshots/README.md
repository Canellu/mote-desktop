# Microsoft Store screenshots and trailer

## Screenshots

Upload the files in `final/` in this order, with these captions:

1. `01-control-dashboard.png` — Control your Hue lights, rooms, zones, and scenes from one customizable desktop dashboard.
2. `02-room-controls.png` — Open a room to set brightness, color, and white for the whole room or a single light.
3. `03-scene-gallery.png` — Preview Hue scene palettes live on your lights, then save the one you want.
4. `04-pc-sync.png` — Sync your lights with video, games, and music playing on your PC with Mote Pro.
5. `05-light-placement.png` — Place each light of an entertainment area around your screen in a 3D view, so sync knows where it sits.
6. `06-desktop-widgets.png` — Pin a compact lighting controller to your desktop for instant access to lights and scenes.
7. `07-custom-widgets.png` — Build custom widgets with the controls, scenes, layout, and size that fit your desktop.
8. `08-sync-box.png` — Switch sources, sync styles, and intensity for a Hue Play HDMI Sync Box.

All final images are 1920×1080 PNG files. `raw/` contains the captures used to build them: `01`–`06` come from the live app, and `07`–`10` are copies of the website's product captures in `mote-website/public/product`. Re-run `scripts/build-store-screenshots.py` after replacing any raw capture.

The backdrop is `backdrops/b-warm-lamp.png`, painted by `scripts/build-store-backdrops.py` along with four unused alternatives. The original photographic backdrop is kept as `store-backdrop.png`; set `STORE_BACKDROP` to it, or to any alternative, before running the screenshot and trailer scripts to switch back.

## Trailer

Upload these in the Store listing's trailer and additional assets sections:

- Video: `../trailer/mote-desktop-trailer.mp4` — 1920×1080, H.264 High, 24 fps, 37 seconds, silent stereo AAC.
- Thumbnail: `../trailer/trailer-thumbnail.png`.
- Title: See Mote Desktop in action
- 16:9 Super hero art: `../trailer/super-hero-art.png`. Without it, the Store does not show trailers at the top of the listing.

The trailer re-frames the website's hero demonstration, which drives the real app with sample Hue resources. After recapturing that demonstration, check the chapter times in `scripts/build-store-trailer.py`, then run it with a full FFmpeg build that includes libx264:

```sh
FFMPEG_PATH=/path/to/ffmpeg python scripts/build-store-trailer.py
```
