#!/usr/bin/env bash
# Full build: voice-over -> score and mix -> frames -> final MP4.
#
#   PYTHON=/path/to/venv/bin/python SILERO=/path/to/v4_ru.pt ./build.sh
#
# The Python environment needs torch, numpy, scipy, omegaconf and mido;
# the system needs ffmpeg, fluidsynth and the FluidR3_GM soundfont.
set -euo pipefail
cd "$(dirname "$0")"

PYTHON=${PYTHON:-python3}
SILERO=${SILERO:-build/v4_ru.pt}
WORKERS=${WORKERS:-2}

mkdir -p build
[ -d node_modules ] || npm install
if [ ! -f "$SILERO" ]; then
  curl -sSL -o "$SILERO" https://models.silero.ai/models/tts/ru/v4_ru.pt
fi

"$PYTHON" audio/make_vo.py "$SILERO" eugene
"$PYTHON" audio/make_music.py
ffmpeg -y -loglevel error -i build/audio/mix_raw.wav -af "volume=0.6dB,alimiter=limit=0.88:level=false" build/audio/mix.wav

node render.mjs --all --workers "$WORKERS" --chunk 60

ffmpeg -y -loglevel error -i build/video_only.mp4 -i build/audio/mix.wav \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest alexandria_tiktok.mp4
cp build/subtitles.srt alexandria_tiktok.srt
echo "done: alexandria_tiktok.mp4"
