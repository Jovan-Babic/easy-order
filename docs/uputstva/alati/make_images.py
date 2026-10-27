# Simple "product photo" placeholders for the guide screenshots.
from PIL import Image, ImageDraw, ImageFont
import sys
out = sys.argv[1]
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
items = {
    "jogurt": ("#E3F2FD", "#1565C0", "JOGURT", "1,5% · 1 l"),
    "mleko": ("#E8F5E9", "#2E7D32", "MLEKO", "2,8% · 1 l"),
    "gauda": ("#FFF8E1", "#F9A825", "GAUDA", "sir · kg"),
    "plazma": ("#FBE9E7", "#BF360C", "KEKS", "300 g"),
    "cokolada": ("#EFEBE9", "#5D4037", "ČOKOLADA", "100 g"),
    "kafa": ("#F3E5F5", "#4A148C", "KAFA", "200 g"),
    "sok": ("#FFFDE7", "#F57F17", "SOK", "jabuka · 1 l"),
    "voda": ("#E0F7FA", "#00838F", "VODA", "1,5 l"),
}
for key, (bg, fg, title, sub) in items.items():
    im = Image.new("RGB", (400, 400), bg)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((70, 60, 330, 340), radius=40, fill=fg)
    d.rounded_rectangle((95, 150, 305, 260), radius=16, fill="white")
    f1 = ImageFont.truetype(F, 34 if len(title) < 8 else 26)
    f2 = ImageFont.truetype(F, 20)
    w = d.textlength(title, font=f1); d.text((200 - w / 2, 168), title, font=f1, fill=fg)
    w = d.textlength(sub, font=f2); d.text((200 - w / 2, 215), sub, font=f2, fill="#444")
    im.save(f"{out}/{key}.png")
