"""Raw screenshots -> docs images: trim an empty bottom (one flat colour), 256 colours."""
import glob, os, sys
from PIL import Image, ImageChops
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, "*.png"))):
    im = Image.open(f).convert("RGB")
    bg = Image.new("RGB", im.size, im.getpixel((5, im.height - 5)))
    box = ImageChops.difference(im, bg).getbbox()
    if box and im.height - box[3] > 200:  # a mostly empty screen (login, password)
        im = im.crop((0, 0, im.width, box[3] + 60))
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(os.path.join(dst, os.path.basename(f)), optimize=True)
    print(os.path.basename(f), im.size)
