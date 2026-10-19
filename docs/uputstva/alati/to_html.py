import markdown, re, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
text = src.read_text(encoding="utf-8")
text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)  # front matter
body = markdown.markdown(text, extensions=["tables"])
base = src.parent.resolve().as_uri() + "/"
html = f"""<!doctype html><html lang="sr"><head><meta charset="utf-8"><base href="{base}">
<style>
@page {{ size: A4; margin: 16mm 16mm 18mm; }}
body {{ font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1f2937; }}
h1 {{ color: #1A4D2E; font-size: 22pt; margin: 0 0 8px; }}
h2 {{ color: #1A4D2E; font-size: 15pt; border-bottom: 2px solid #E8F3EB; padding-bottom: 4px; margin-top: 26px; break-after: avoid; }}
h3 {{ font-size: 12pt; margin: 18px 0 6px; break-after: avoid; }}
p img {{ display: block; max-width: 270px; max-height: 470px; margin: 10px auto; border: 1px solid #e5e7eb; border-radius: 12px; break-inside: avoid; }}
blockquote {{ margin: 12px 0; padding: 8px 14px; background: #FFF7ED; border-left: 4px solid #F97316; border-radius: 6px; break-inside: avoid; }}
blockquote p {{ margin: 4px 0; }} blockquote ol {{ margin: 4px 0 4px 18px; padding: 0; }}
table {{ border-collapse: collapse; width: 100%; font-size: 9.5pt; break-inside: avoid; }}
th, td {{ border: 1px solid #e5e7eb; padding: 5px 7px; text-align: left; vertical-align: top; }} th {{ background: #E8F3EB; }}
hr {{ border: 0; height: 0; margin: 6px 0; }}
</style></head><body>{body}</body></html>"""
tmp = out.with_suffix(".html"); tmp.write_text(html, encoding="utf-8")
print(tmp)
