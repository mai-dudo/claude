#!/usr/bin/env bash
# Full build: fonts → pixel portraits → voice-overs (if any) → script → frames → soundtrack → out/esli-by-ya.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scene/fonts/fonts.css ] || bash tools/fetch-fonts.sh
node tools/sprites.js
if find voice -maxdepth 1 -type f \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.oga' -o -iname '*.opus' \
     -o -iname '*.m4a' -o -iname '*.aac' -o -iname '*.flac' -o -iname '*.webm' -o -iname '*.mp4' \) | grep -q .; then
  python3 tools/voices.py
fi
node tools/make-script.js
node tools/render.js
python3 tools/audio.py
ffmpeg -y -v error -i out/video.mp4 -i out/audio.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out/esli-by-ya.mp4
echo "готово: out/esli-by-ya.mp4"
