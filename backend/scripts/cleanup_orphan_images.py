"""One-off cleanup of orphaned product images on Cloudinary.

Lists every image in the `easy-order/products` folder, subtracts the ones a
product still references (`products.image`) and deletes the rest. Images
younger than --min-age-hours (default 24) are skipped so an image that is being
saved right now is never removed.

Dry run by default - nothing is deleted without --apply.

    cd backend
    python scripts/cleanup_orphan_images.py            # list what would be deleted
    python scripts/cleanup_orphan_images.py --apply    # delete

Needs MONGO_URL, DB_NAME and the Cloudinary env vars (backend/.env is loaded).
Point it at the real database deliberately - it reads `products` only.
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cloudinary
import cloudinary.api
import cloudinary.uploader
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FOLDER = "easy-order/products"  # keep in sync with PRODUCT_IMAGE_FOLDER in server.py


def list_cloudinary_images():
    cursor = None
    while True:
        page = cloudinary.api.resources(
            type="upload", resource_type="image", prefix=f"{FOLDER}/", max_results=500, next_cursor=cursor
        )
        yield from page.get("resources", [])
        cursor = page.get("next_cursor")
        if not cursor:
            return


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    parser.add_argument("--min-age-hours", type=float, default=24.0)
    args = parser.parse_args()

    cloudinary.config(secure=True)  # reads CLOUDINARY_URL; falls back to the split vars below
    if not cloudinary.config().cloud_name:
        cloudinary.config(
            cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
            api_key=os.environ.get("CLOUDINARY_API_KEY"),
            api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
            secure=True,
        )
    if not cloudinary.config().api_secret:
        print("Cloudinary is not configured.", file=sys.stderr)
        return 1

    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    used = {p["image"] for p in db.products.find({"image": {"$type": "string", "$ne": ""}}, {"image": 1})}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=args.min_age_hours)
    orphans, kept_young, kept_used = [], 0, 0
    for res in list_cloudinary_images():
        urls = {res.get("secure_url"), res.get("url")}
        if urls & used:
            kept_used += 1
            continue
        created = datetime.fromisoformat(res["created_at"].replace("Z", "+00:00"))
        if created > cutoff:
            kept_young += 1
            continue
        orphans.append(res)

    total_bytes = sum(r.get("bytes", 0) for r in orphans)
    print(f"In use: {kept_used} | too recent: {kept_young} | orphaned: {len(orphans)} ({total_bytes / 1024:.0f} KB)")
    for res in orphans:
        print(("DELETE " if args.apply else "would delete ") + res["public_id"])
        if args.apply:
            cloudinary.uploader.destroy(res["public_id"], resource_type="image")
    if orphans and not args.apply:
        print("Dry run - re-run with --apply to delete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
