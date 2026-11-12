"""Raw website screenshots -> landing/public/screens/*.webp (portal shots scaled to 1440 px wide)."""
import glob, os, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, "*.png"))):
    im = Image.open(f).convert("RGB")
    if im.width > 1440:
        im = im.resize((1440, round(im.height * 1440 / im.width)), Image.LANCZOS)
    out = os.path.join(dst, os.path.splitext(os.path.basename(f))[0] + ".webp")
    im.save(out, "WEBP", quality=85)
    print(os.path.basename(out), im.size)
