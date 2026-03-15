#!/bin/bash
# Generate Electron app icons from logo.svg
# Requires: librsvg (brew install librsvg) and iconutil (built into macOS)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Generating icons from logo.svg..."

# Check for rsvg-convert
if ! command -v rsvg-convert &> /dev/null; then
    echo "Error: rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi

# Generate PNG at various sizes
echo "Creating PNGs..."
rsvg-convert -w 16 -h 16 logo.svg -o icon_16.png
rsvg-convert -w 32 -h 32 logo.svg -o icon_32.png
rsvg-convert -w 64 -h 64 logo.svg -o icon_64.png
rsvg-convert -w 128 -h 128 logo.svg -o icon_128.png
rsvg-convert -w 256 -h 256 logo.svg -o icon_256.png
rsvg-convert -w 512 -h 512 logo.svg -o icon_512.png
rsvg-convert -w 1024 -h 1024 logo.svg -o icon_1024.png

# Main icon for Linux
cp icon_512.png icon.png

# Generate macOS .icns
echo "Creating macOS .icns..."
mkdir -p icon.iconset
cp icon_16.png icon.iconset/icon_16x16.png
cp icon_32.png icon.iconset/icon_16x16@2x.png
cp icon_32.png icon.iconset/icon_32x32.png
cp icon_64.png icon.iconset/icon_32x32@2x.png
cp icon_128.png icon.iconset/icon_128x128.png
cp icon_256.png icon.iconset/icon_128x128@2x.png
cp icon_256.png icon.iconset/icon_256x256.png
cp icon_512.png icon.iconset/icon_256x256@2x.png
cp icon_512.png icon.iconset/icon_512x512.png
cp icon_1024.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

# Generate Windows .ico (requires ImageMagick)
if command -v convert &> /dev/null; then
    echo "Creating Windows .ico..."
    convert icon_16.png icon_32.png icon_64.png icon_128.png icon_256.png icon.ico
else
    echo "Warning: ImageMagick not found. Skipping .ico generation."
    echo "Install with: brew install imagemagick"
fi

# Cleanup intermediate PNGs
rm -f icon_16.png icon_32.png icon_64.png icon_128.png icon_256.png icon_1024.png

echo "Done! Generated:"
ls -la icon.*
