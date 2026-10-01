import hashlib
import json
import os
from datetime import datetime
from .. import config


def save_fingerprint(name, data):
    """Save a provider fingerprint to the local library."""
    db = _load_db()

    entry = {
        "name": name,
        "collected_at": datetime.utcnow().isoformat() + "Z",
        "signature": _generate_signature(data),
        "data": data,
    }

    db[name] = entry
    _save_db(db)
    print(f"\n  [+] Saved fingerprint '{name}' to {config.FINGERPRINT_DB}")


def load_fingerprint(name):
    """Load a fingerprint from the local library."""
    db = _load_db()
    if name not in db:
        raise KeyError(f"No fingerprint found for '{name}'. Available: {', '.join(db.keys()) or 'none'}")
    return db[name]["data"]


def list_fingerprints():
    """List all saved fingerprints."""
    db = _load_db()
    if not db:
        print("\n  No fingerprints saved yet.")
        return

    print(f"\n  Saved fingerprints ({len(db)}):\n")
    for name, entry in sorted(db.items()):
        collected = entry.get("collected_at", "unknown")
        sig = entry.get("signature", {})
        data = entry.get("data", {})
        cats = sig.get("category_count", 0)
        streams = sig.get("stream_count", 0)
        aliases = data.get("aliases", [])
        dns_count = len(data.get("all_domains", []))

        line = f"    {name:30s}  {cats:4d} cats  {streams:6d} streams  {dns_count:3d} dns  ({collected})"
        print(line)
        if aliases:
            print(f"    {'':30s}  aliases: {', '.join(aliases)}")


def delete_fingerprint(name):
    """Delete a fingerprint from the library."""
    db = _load_db()
    if name not in db:
        raise KeyError(f"No fingerprint found for '{name}'")
    del db[name]
    _save_db(db)
    print(f"  [+] Deleted fingerprint '{name}'")


def _generate_signature(data):
    """Generate a compact signature hash from fingerprint data."""
    xtream = data.get("xtream", {})

    # Hash the sorted stream IDs
    stream_ids = sorted(xtream.get("stream_id_set", []))
    stream_hash = hashlib.sha256(",".join(stream_ids).encode()).hexdigest()[:16]

    # Hash the sorted category names
    cat_names = sorted(c.get("category_name", "") for c in xtream.get("categories", []))
    cat_hash = hashlib.sha256(",".join(cat_names).encode()).hexdigest()[:16]

    return {
        "stream_id_hash": stream_hash,
        "category_hash": cat_hash,
        "stream_count": len(stream_ids),
        "category_count": len(cat_names),
        "api_type": xtream.get("api_type", ""),
        "server_software": data.get("headers", {}).get("server_software", ""),
    }


def _load_db():
    """Load the fingerprint database from disk."""
    if not os.path.exists(config.FINGERPRINT_DB):
        return {}
    with open(config.FINGERPRINT_DB, encoding="utf-8") as f:
        return json.load(f)


def _save_db(db):
    """Save the fingerprint database to disk."""
    with open(config.FINGERPRINT_DB, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, default=str)
