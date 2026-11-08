# App icon (IronPlan, 25 Oct 2026)

The mark: two blue brackets with a light bar running through them. It reads as a barbell, and still as a range (the bracket). Colours follow the Plate dark theme: background `#16191C`, brackets `#8EB1F1` (the uncertainty colour), bar `#F9F4EE`; monochrome all white.

- `make-assets.py <workdir>` renders `assets/images` (icon, adaptive foreground and monochrome, splash, favicon) into `<workdir>/icons/`. Copy them into `assets/images`.
- `make-android-res.py <workdir> android/app/src/main/res` renders the launcher webps and splash logos at every density, at the same glyph proportions as the old resources.

Both need `rsvg-convert`; the Android script also needs ImageMagick (`magick`) for webp.
