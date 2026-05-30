# Icons

`icon.svg` is a placeholder used by `manifest.json`.

Chrome's manifest officially expects PNGs at common sizes. Before publishing
to the Chrome Web Store, generate proper PNGs:

```powershell
# example with ImageMagick
magick public/icons/icon.svg -resize 16x16   public/icons/icon-16.png
magick public/icons/icon.svg -resize 32x32   public/icons/icon-32.png
magick public/icons/icon.svg -resize 48x48   public/icons/icon-48.png
magick public/icons/icon.svg -resize 128x128 public/icons/icon-128.png
```

Then update `manifest.json`:

```jsonc
"icons": {
  "16":  "public/icons/icon-16.png",
  "32":  "public/icons/icon-32.png",
  "48":  "public/icons/icon-48.png",
  "128": "public/icons/icon-128.png"
}
```

