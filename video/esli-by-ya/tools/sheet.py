# Contact sheet of stills for quick review: python3 tools/sheet.py out/shots out/sheet
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir(src) if f.endswith('.png'))
W, H, C, R = 640, 360, 3, 3
for k in range(0, len(files), C * R):
    sheet = Image.new('RGB', (W * C, H * R), 'white')
    for i, f in enumerate(files[k:k + C * R]):
        im = Image.open(os.path.join(src, f)).convert('RGB').resize((W, H), Image.LANCZOS)
        sheet.paste(im, ((i % C) * W, (i // C) * H))
    sheet.save(f'{dst}-{k // (C * R) + 1}.jpg', quality=88)
    print(f'{dst}-{k // (C * R) + 1}.jpg', files[k:k + C * R])
