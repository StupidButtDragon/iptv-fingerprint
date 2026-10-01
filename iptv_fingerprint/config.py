import os

# All API keys are optional. The tool works with zero keys configured.
# Shodan InternetDB is used automatically (free, no key needed).
# Set these as environment variables to enable extra data sources:
#   CENSYS_API_KEY  - https://censys.io, free Personal Access Token
#   URLSCAN_API_KEY - https://urlscan.io, free API key
CENSYS_API_KEY = os.environ.get("CENSYS_API_KEY", "")
URLSCAN_API_KEY = os.environ.get("URLSCAN_API_KEY", "")

# Saved scans, user-promoted providers and CSV exports live here
DATA_DIR = os.path.join(os.path.expanduser("~"), ".iptv-fingerprint")
os.makedirs(DATA_DIR, exist_ok=True)
FINGERPRINT_DB = os.path.join(DATA_DIR, "fingerprints.json")
USER_PROVIDERS = os.path.join(DATA_DIR, "providers.json")
