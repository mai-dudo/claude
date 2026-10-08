# Promo clip generator

Recreates the vertical 1080×1920 promo: three collage tiles flip through four
texture sets every 0.5 s, an arc draws across the screen, the tiles cut away,
two title cards ("Haiku 5.5", then spark + "Claude") sit on the arc, the arc
wipes out and the tiles come back. 10.75 s, loops seamlessly.

All textures are generated procedurally in `textures.py` (no source images).

```
python3 make_video.py                         # -> promo.mp4
python3 make_video.py --title "Sonnet 5.5"    # different first title
python3 make_video.py --fps 30 --loops 3      # 30 fps, 3 cycles (32 s)
python3 make_video.py --seed 12               # different texture variation
python3 make_video.py --still 5.5             # one PNG frame at t=5.5 s
```

Needs Python 3, numpy, Pillow and ffmpeg with libx264. The Literata font is
downloaded from Google Fonts on first run into `fonts/` (falls back to
DejaVu Serif offline); pass `--font path.ttf` to use your own.
