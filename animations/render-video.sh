#!/usr/bin/env bash
# Builds tashkent-tv-tower.mp4 (1080x1920, 30 fps, 20 s, with music).
# Needs: node + playwright (chromium), python3 + numpy + scipy, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"
WORK=$(mktemp -d); mkdir -p "$WORK/frames"
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV; rm -rf "$WORK"' EXIT
sleep 1
for k in 0 1 2; do node render-frames.js $k 3 30 "$WORK/frames" & done; wait
python3 make_music.py "$WORK/music.wav"
ffmpeg -y -framerate 30 -i "$WORK/frames/f%04d.jpg" -i "$WORK/music.wav" -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 \
  -c:a aac -b:a 192k -ar 48000 -af "volume=-0.8dB" -movflags +faststart -shortest tashkent-tv-tower.mp4
