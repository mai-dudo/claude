# Promo clip generator

Recreates the vertical 1080×1920 promo: three collage tiles flip through four
texture sets every 0.5 s, an arc draws across the screen, the tiles cut away,
two title cards ("Haiku 5.5", then spark + "Claude") sit on the arc, the arc
wipes out and the tiles come back. 10.75 s, loops seamlessly.

All textures are generated procedurally (no source images):
`textures.py` for the paper-collage look, `textures_brawl.py` for the
cartoon game look. `sound.py` synthesises a soundtrack synced to the cuts.

Themes (`--theme`):

- `claude` (default): off-white, paper collage, thin black arc, serif titles, silent.
- `brawl`: Brawl Stars style fan ad. Dark blue, outlined cartoon tiles (gem,
  crate, power cube, trophy, ball, VS, bushes, bricks…), yellow arc, bold
  outlined titles that pop in, "BRAWL STARS" / "★ ИГРАЙ СЕЙЧАС", with sound.
  Unofficial: no game assets or logos are used.

```
python3 make_video.py                         # -> promo.mp4
python3 make_video.py --theme brawl           # -> brawl.mp4
python3 make_video.py --theme brawl --brand "СКАЧАЙ БЕСПЛАТНО"
python3 make_video.py --title "Sonnet 5.5"    # different first title
python3 make_video.py --fps 30 --loops 3      # 30 fps, 3 cycles (32 s)
python3 make_video.py --seed 12               # different texture variation
python3 make_video.py --still 5.5             # one PNG frame at t=5.5 s
python3 make_video.py --no-sound              # mute (or --sound to add it)
```

Needs Python 3, numpy, Pillow and ffmpeg with libx264. Fonts (Literata;
Lilita One + Rubik Black for Cyrillic in the brawl theme) are downloaded
from Google Fonts on first run into `fonts/` (falls back to DejaVu offline);
pass `--font path.ttf` to use your own.
