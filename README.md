# IPTV Fingerprint

Find out whether an IPTV provider is its own service or a rebrand of another one. You give it a provider's Xtream login (server URL, username and password). It downloads the channel list, categories and stream IDs, looks up the server's infrastructure, and compares everything against providers it already knows.

It runs as a small app on your own computer that you use in your web browser. Your provider logins never leave your computer.

---

## Windows setup (step by step)

You only do steps 1 and 2 once.

### Step 1: Install Python

Python is the programming language the app is written in. You don't need to know it, the app just needs it installed.

1. Go to **https://www.python.org/downloads/** and click the yellow **Download Python** button.
2. Open the downloaded file.
3. **Important:** on the first screen, tick the box at the bottom that says **"Add python.exe to PATH"**. If you skip this, the commands below won't work.
4. Click **Install Now** and wait for it to finish, then click **Close**.

Check it worked:

1. Press the **Windows key**, type **cmd**, and press **Enter**. A black window opens. This is the **Command Prompt**.
2. Type this and press **Enter**:
   ```
   python --version
   ```
3. You should see something like `Python 3.13.0`. If instead the Microsoft Store opens, or you see `'python' is not recognized`, see [Troubleshooting](#troubleshooting).

### Step 2: Install IPTV Fingerprint

In the same Command Prompt window, copy and paste this line (right-click pastes) and press **Enter**:

```
python -m pip install https://github.com/cage47/iptv-fingerprint/archive/refs/heads/main.zip
```

Wait until it says `Successfully installed ... iptv-fingerprint-...`.

### Step 3: Start the app

Whenever you want to use the app:

1. Open the **Command Prompt** (Windows key, type **cmd**, press **Enter**).
2. Type this and press **Enter**:
   ```
   iptv-fingerprint
   ```
3. Your web browser opens the app. If it doesn't, open your browser and go to **http://localhost:8765**.

**Keep the black Command Prompt window open while you use the app.** Closing it (or pressing **Ctrl+C** in it) stops the app.

### Step 4: Identify a provider

1. In the app, click **Identify a provider** on the left.
2. Fill in:
   - **Scan name**: any name you'll remember, e.g. `mystery`
   - **Server URL**: the provider's server address, e.g. `http://server.com:8080`
   - **Username** and **Password**: the provider's Xtream login (a trial login is fine)
3. Click **Run**. It takes a few minutes. Progress appears in the dark box below.
4. Scroll to the bottom of the output and look for **KNOWN PROVIDER MATCHING**:

   | Result | Meaning |
   |---|---|
   | `*** ... [MATCH]` | Almost certainly a rebrand of that provider |
   | `** ... [LIKELY]` | Strong signs it's the same source |
   | `* ... [POSSIBLE]` / `. ... [WEAK]` | Some overlap, not conclusive |
   | `No matches found` | Looks like an unknown or unique source |

Other buttons:

- **Compare two scans**: once you've scanned two providers, see how much they overlap.
- **Save as known provider**: add a scanned provider to your own list so future scans are matched against it.
- **Saved scans**: everything you've scanned so far.
- **Investigate a domain**: look up a server address without needing a login.

### Updating

Open the Command Prompt and run:

```
python -m pip install --upgrade --force-reinstall https://github.com/cage47/iptv-fingerprint/archive/refs/heads/main.zip
```

Your saved scans are kept.

### Where your data is stored

Saved scans, your own known providers and CSV exports are in the `.iptv-fingerprint` folder in your user folder. To open it, press **Windows key + R**, paste `%USERPROFILE%\.iptv-fingerprint` and press **Enter**.

### Uninstalling

```
python -m pip uninstall iptv-fingerprint
```

Then delete the `.iptv-fingerprint` folder above if you also want to remove your saved scans.

### Troubleshooting

**Typing `python` opens the Microsoft Store, or says `'python' is not recognized`**
Python wasn't added to PATH. Run the Python installer again, choose **Modify**, click **Next**, tick **"Add Python to environment variables"**, and click **Install**. Then close the Command Prompt and open a new one. Or use `py` instead of `python` in every command above (e.g. `py -m pip install ...`).

**`'iptv-fingerprint' is not recognized`**
Start it this way instead, which always works:
```
python -m iptv_fingerprint
```

**`Port 8765 is already in use`**
The app is probably already running in another Command Prompt window, so just go to **http://localhost:8765** in your browser. Otherwise start it on a different port: `iptv-fingerprint web --port 8766`, then go to **http://localhost:8766**.

**The browser shows "This site can't be reached"**
The app isn't running. Start it again (Step 3) and keep the Command Prompt window open.

**A scan says `Could not authenticate`**
Check the server URL (including `http://` and the port number), username and password. Some providers block certain networks; if you use a VPN, try turning it off, or on.

---

## Mac and Linux

Install Python 3.8 or newer (Mac: from python.org; most Linux systems already have it), then in a Terminal:

```
python3 -m pip install https://github.com/cage47/iptv-fingerprint/archive/refs/heads/main.zip
iptv-fingerprint
```

If `iptv-fingerprint` isn't found, use `python3 -m iptv_fingerprint`. Data is stored in `~/.iptv-fingerprint`. On newer Linux systems pip may refuse to install system-wide; use `pipx install https://github.com/cage47/iptv-fingerprint/archive/refs/heads/main.zip` instead.

## Optional API keys

The app works without any keys. Free keys from these sites add extra infrastructure lookups:

| Variable | Get one at |
|---|---|
| `CENSYS_API_KEY` | censys.io, free Personal Access Token |
| `URLSCAN_API_KEY` | urlscan.io, free account |

On Windows, set one by running this in the Command Prompt (then open a new Command Prompt window before starting the app):

```
setx CENSYS_API_KEY "your-key-here"
```

On Mac/Linux, add `export CENSYS_API_KEY="your-key-here"` to your `~/.zshrc` or `~/.bashrc`.

## Command line

Every button in the browser app is also a command. Run `iptv-fingerprint <command> --help` for options.

### collect

Scan a provider and save its fingerprint. Pulls categories, streams, VOD, series, logo URLs, EPG sources, HTTP headers, DNS records, WHOIS data, SSL certs, and crt.sh certificate history. Automatically matches the scan against known providers.

```
iptv-fingerprint collect --name "mystery" --url http://server.com:8080 --user trial123 --pass trial456
```

Add `--stream-test` to also pull and analyze a sample `.ts` segment for PID and codec fingerprinting.

### compare

Side-by-side diff of two saved fingerprints. Shows overlap percentages for stream IDs, category IDs, category names, ordering, naming patterns, logo domains, EPG URLs, VOD library, and infrastructure.

```
iptv-fingerprint compare --a "mystery" --b "trex"
```

### match

Re-run a saved fingerprint against the known providers database without re-scanning.

```
iptv-fingerprint match --name "mystery"
```

### promote

Add a scanned provider to the known providers database so future scans match against it.

```
iptv-fingerprint promote --name "mystery" --id "mystery-tv" --display "Mystery TV"
iptv-fingerprint promote --name "mystery" --id "mystery-tv" --display "Mystery TV" --dns "dns1.mystery.tv,dns2.mystery.tv"
```

### investigate

Run DNS, WHOIS, SSL, and OSINT lookups on a domain without needing credentials.

```
iptv-fingerprint investigate --domain provider.example.com
iptv-fingerprint investigate --domain provider.example.com --port 8080
```

### list / delete

```
iptv-fingerprint list
iptv-fingerprint delete --name "mystery"
```

## What it looks for

**Stream IDs** are the strongest signal. These are database primary keys assigned by the source panel. Two providers serving the same channel with the same `stream_id` value are pulling from the same upstream. Even 10 matching IDs is near-conclusive.

**Category IDs and names** work the same way. Resellers inherit the source panel's category structure. The exact strings, the ordering, and the Unicode characters used (pipes vs brackets, star symbols vs emoji) all narrow things down.

**Logo domains** embedded in API responses often point back to the source panel's infrastructure. A provider branded as "SuperTV" whose channel logos load from `103.176.90.118` shares logo hosting with other services on that same IP.

**EPG URLs** in the M3U playlist header identify the guide data source. Shared EPG sources suggest shared infrastructure.

**VOD library overlap** catches resellers who inherit the same movie catalog without modification.

**DNS, WHOIS, SSL, and OSINT data** reveal the underlying infrastructure. Shared IPs, same hosting provider, same SSL certificate SANs, same Cloudflare edge routing, same registrar on the same day.

## Known providers (built in)

The tool ships with profiles for these providers. New scans are automatically compared against them.

| Provider | Categories | Streams | Key identifiers |
|---|---|---|---|
| T-Rex | ~830 | ~55,500 | Pipe separators, no star chars, superscript unicode, logo IPs 103.176.90.x |
| Strong8k | ~900 | ~56,700 | Pipe separators, 8K sport category, sun symbol, shared logo IPs with T-Rex |
| Mega | ~320 | ~27,500 | Pipe separators, logos on line.megacdn.live |
| Dream4K | ~460 | unknown | Uses U+272A star, French-first category order, aggressive IP blocking |

Use **Save as known provider** (`promote`) to add your own. They're stored in your data folder, not in the app.

## Without DNS/WHOIS tools

DNS uses Google DNS-over-HTTPS and WHOIS uses RDAP, so no `dig` or `whois` install is needed. Other free, keyless sources: crt.sh certificate transparency, HTTP header analysis, reverse IP lookups via HackerTarget, IP geolocation via ipinfo.io, and Shodan InternetDB.
