# IPTV Fingerprint

Find out whether an IPTV provider is its own service or a rebrand of another one. You give it a provider's Xtream login (server URL, username and password). It downloads the channel list, categories and stream IDs, looks up the server's infrastructure, and compares everything against providers it already knows.

It runs as a small app on your own computer that you use in your web browser. Your provider logins are only ever sent to the provider itself, never to anyone else.

---

# Setup

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

### Step 4: Identify your first provider

Click **Identify a provider**, fill in a scan name, the server URL, username and password, and click **Run**. The full walkthrough is in [Using the tool](#using-the-tool) below.

### Updating, data folder, uninstalling and troubleshooting (Windows)

#### Updating

Open the Command Prompt and run:

```
python -m pip install --upgrade --force-reinstall https://github.com/cage47/iptv-fingerprint/archive/refs/heads/main.zip
```

Your saved scans are kept.

#### Where your data is stored

Saved scans, your own known providers and CSV exports are in the `.iptv-fingerprint` folder in your user folder. To open it, press **Windows key + R**, paste `%USERPROFILE%\.iptv-fingerprint` and press **Enter**.

#### Uninstalling

```
python -m pip uninstall iptv-fingerprint
```

Then delete the `.iptv-fingerprint` folder above if you also want to remove your saved scans.

#### Troubleshooting

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

---

# Using the tool

Each section below starts with the button name in the browser app, and the matching command for people who prefer the command line.

## Identify a provider

**Button:** Identify a provider  **Command:** `iptv-fingerprint collect`

This is the main feature. Give it a provider's Xtream login and it:

1. Logs in and downloads the live categories, channel list, VOD catalog and series categories.
2. Records the fingerprint: stream IDs, category IDs and names, category order, naming style, logo hosts and EPG source.
3. Looks up the server: DNS, IP owner and location, SSL certificate, Cloudflare, WHOIS registration, certificate history, other sites on the same IP.
4. Saves all of it under your scan name.
5. Compares it against every known provider and prints the verdict.

| Field | What to enter |
|---|---|
| Scan name | Any name you'll recognise later, e.g. `mystery` or the brand name. Reusing a name replaces that scan. |
| Server URL | The address from your provider, including `http://` and the port, e.g. `http://server.com:8080` |
| Username / Password | The Xtream login. A trial login is fine. |
| Extra domains | Optional. Other server addresses the provider gave you (backup URLs, MAG portal, etc.), comma-separated. Each one is investigated too. |
| EPG URLs | Optional. TV guide (XMLTV) links the provider gave you, comma-separated. Saved with the scan and used when comparing scans. |
| Also analyze a sample stream | Optional. Opens one live channel for a few seconds to read its technical layout. This uses one connection on the account. |

```
iptv-fingerprint collect --name "mystery" --url http://server.com:8080 --user USER --pass PASS
iptv-fingerprint collect --name "mystery" --url http://server.com:8080 --user USER --pass PASS --dns "backup1.com,backup2.com" --epg "http://epg.example.com/guide.xml" --stream-test
```

### Reading the result

Scroll to **KNOWN PROVIDER MATCHING** at the bottom of the output:

| Result | Score | Meaning |
|---|---|---|
| `*** Name [MATCH]` | 50+ | Almost certainly the same source, i.e. a rebrand or reseller of that provider |
| `** Name [LIKELY]` | 25–49 | Strong signs of the same source |
| `* Name [POSSIBLE]` | 10–24 | Some overlap. Could be related, could be coincidence |
| `. Name [WEAK]` | under 10 | Only trivial similarities (e.g. a similar channel count) |
| `No matches found` | | Not related to anything in your database. Possibly a unique source; see [promote](#save-a-new-provider) |

The indented lines under each provider explain its score, e.g. `Stream ID overlap: 30/30 sample IDs match (100%)`. See [How matching works](#how-matching-works) for what each signal is worth.

## Re-match a saved scan

**Button:** Re-match a scan  **Command:** `iptv-fingerprint match --name "mystery"`

Runs the matching again on a scan you already saved, without contacting the provider. Use it after you've added or updated providers in your database, to see whether older scans now match something.

## Compare two scans

**Button:** Compare two scans  **Command:** `iptv-fingerprint compare --a "mystery" --b "other"`

A detailed side-by-side of two **saved scans** (not built-in providers). Use it when you've scanned two brands and want to know whether they're the same service. It shows the overlap for each signal:

stream IDs, category IDs, category names, category order, naming style, logo hosts, EPG URLs, VOD library, and infrastructure (same server software, both behind Cloudflare, shared IPs, same hosting company).

It ends with an overall confidence score:

| Confidence | Verdict |
|---|---|
| 80%+ | Same source, almost certainly the same upstream panel |
| 60–79% | Likely same source |
| 40–59% | Possibly related, some shared infrastructure or a partial rebrand |
| 20–39% | Weak relationship, could be coincidence |
| under 20% | Different sources |

## Add domains or EPG URLs to a scan

**Button:** Add domains / EPG  **Command:** `iptv-fingerprint enrich`

Providers often hand out several server addresses (main, backup, MAG portal), change them over time, and publish separate TV guide links. Add them to an existing scan without logging in again:

- **Extra domains**: each new domain gets the full infrastructure lookup (headers, SSL, DNS, OSINT, plus WHOIS if you tick the box) and is added to the scan's domain list.
- **EPG URLs**: added to the scan's EPG list.
- **HTTP port**: the port to check on the new domains, if not 80.

```
iptv-fingerprint enrich --name "mystery" --dns "backup1.com,http://backup2.com:8080"
iptv-fingerprint enrich --name "mystery" --epg "http://epg.example.com/guide.xml"
iptv-fingerprint enrich --name "mystery" --dns "backup3.com" --port 8080 --whois
```

Why bother: domains you add here go into the provider's profile when you [promote](#save-a-new-provider) it. A later scan of **any** of those domains is then identified instantly, because a domain match is the single strongest signal (40 points).

## Save a new provider

**Button:** Save as known provider  **Command:** `iptv-fingerprint promote`

Turns a saved scan into a reference profile in your provider database. From then on, every new scan is checked against it.

| Field | What to enter |
|---|---|
| Scan name | The saved scan to use |
| Provider ID | A short unique ID, e.g. `mystery-tv`. Using an existing ID replaces that provider (handy for refreshing a profile). |
| Display name | The name shown in results, e.g. `Mystery TV` |
| Extra domains | Optional. More known domains for this provider, comma-separated |

```
iptv-fingerprint promote --name "mystery" --id "mystery-tv" --display "Mystery TV"
iptv-fingerprint promote --name "mystery" --id "mystery-tv" --display "Mystery TV" --dns "dns1.mystery.tv,dns2.mystery.tv"
```

The profile stores: every domain in the scan (including ones added with **Add domains / EPG**) plus any extra domains, 30 sample category IDs and stream IDs, the first 9 category names in order, the naming style, up to 10 logo hosts, the expected channel and category counts (±5%), server software, API type and timezone.

**Before promoting, check the scan's own result.** If it already matched an existing provider as MATCH or LIKELY, it's a rebrand, not a new source: use [Merge](#merge-two-scans) or [Aliases](#aliases) instead. Otherwise you end up with two profiles for one service, and results get split between them.

Promoted providers are saved in `providers.json` in your [data folder](#where-your-data-is-stored), not inside the app, so updating the app never removes them.

## Building your own provider database

The app ships with only 4 reference providers. It can only recognise what's in its database, so a scan of a reseller of any other service comes back as `No matches found`. Every unique provider you add makes the tool better at its job:

- **One profile catches every rebrand.** Resellers can't change stream IDs or category IDs; they come from the source panel's database. Profile a source once, and every reseller selling that source, under any brand name, matches it.
- **Domains give instant identification.** Providers rotate domains and hand out backup URLs. Each domain in a profile is worth 40 points on its own, enough for a LIKELY verdict before the content is even compared. The more domains you collect (with **Extra domains** and **Add domains / EPG**), the more scans are identified straight away.
- **More profiles sharpen the results.** Some sources share infrastructure: T-Rex and Strong8k, for example, use the same logo servers. With only one of them in the database, a scan of the other could look related. With both profiled, the stream and category IDs separate them clearly.
- **Profiles stay current.** Sources add channels and reorder categories over time. Re-scan occasionally and promote again with the **same Provider ID** to refresh the profile.
- **It's yours to share.** Your profiles live in one file, `providers.json`. Back it up, or give it to someone else to put in their data folder. Note that this replaces their own file.

A good routine for a new provider:

1. **Identify a provider**: scan it with a trial login.
2. If it **matches** something: it's a rebrand. Optionally add the brand name with **Aliases**.
3. If there are **no matches**: add every domain and EPG link you know with **Add domains / EPG**, then **Save as known provider**.
4. Later, **Re-match a scan** on your older scans to see whether any of them belong to the new provider.

## Merge two scans

**Button:** Merge scans  **Command:** `iptv-fingerprint merge --source "brand-b" --into "brand-a"`

When you find that two scans are the same service (for example a brand and its reseller), fold one into the other. The target scan gains the source's domains, EPG URLs, logo hosts and OSINT data, and the source's name (and its aliases) is recorded as an alias. Tick **Delete the source scan afterwards** (`--delete-source`) to remove the duplicate. Promote the merged scan to put all its domains into the provider profile.

## Aliases

**Button:** Aliases  **Command:** `iptv-fingerprint alias --name "brand-a" "Brand B" "Brand C"`

Record other names a service is sold under. Aliases appear in **Saved scans**. Tick **Remove instead of add** (`--remove`) to delete aliases.

## Investigate a domain

**Button:** Investigate a domain  **Command:** `iptv-fingerprint investigate --domain server.com`

Infrastructure lookup without a login: HTTP headers, SSL certificate, Cloudflare, DNS, IP owner and location, certificate history, other sites on the same IP, WHOIS registration and Shodan data. Useful for a domain you found in an app, a playlist or a sales page. Nothing is saved. Add `--port 8080` (or the **HTTP port** field) to check a specific port.

## Export channels to CSV

**Button:** Export channels to CSV  **Command:** `iptv-fingerprint export --name "mystery" --url http://server.com:8080 --user USER --pass PASS`

Downloads every live channel with its category, stream ID, EPG ID and logo URL into a spreadsheet file (`mystery_channels.csv` in your data folder) and prints the 20 biggest categories. Open it in Excel or Google Sheets to browse a lineup or compare providers by hand. On the command line, `-o file.csv` picks a different location.

## Saved scans and deleting

**Buttons:** Saved scans, Delete a scan  **Commands:** `iptv-fingerprint list`, `iptv-fingerprint delete --name "mystery"`

**Saved scans** lists every scan with its category, channel and domain counts, date and aliases. **Delete a scan** removes one permanently.

# How matching works

## What it looks for

**Stream IDs** are the strongest signal. These are database primary keys assigned by the source panel. Two providers serving the same channel with the same `stream_id` value are pulling from the same upstream. Even 10 matching IDs is near-conclusive.

**Category IDs and names** work the same way. Resellers inherit the source panel's category structure. The exact strings, the ordering, and the Unicode characters used (pipes vs brackets, star symbols vs emoji) all narrow things down.

**Logo domains** embedded in API responses often point back to the source panel's infrastructure. A provider branded as "SuperTV" whose channel logos load from `103.176.90.118` shares logo hosting with other services on that same IP.

**EPG URLs** in the M3U playlist header identify the guide data source. Shared EPG sources suggest shared infrastructure.

**VOD library overlap** catches resellers who inherit the same movie catalog without modification.

**DNS, WHOIS, SSL, and OSINT data** reveal the underlying infrastructure. Shared IPs, same hosting provider, same SSL certificate SANs, same Cloudflare edge routing, same registrar on the same day.

## Scoring against known providers

Each scan is scored against every provider in your database. Points add up from these signals:

| Signal | Points |
|---|---|
| Scanned domain is one of the provider's known domains | 40 |
| Stream ID overlap with the provider's sample IDs | up to 30 |
| Category ID overlap | up to 15 |
| Category names in common | up to 10 |
| Shared logo hosts | up to 8 |
| Shared category names appear in the same order | 5 |
| Same naming style (pipes, brackets, stars) | 3 |
| Channel count within the provider's expected range | 2 |
| Same server software | 1 |

50 or more is a MATCH, 25 or more LIKELY, 10 or more POSSIBLE. Stream and category IDs are the content evidence; a domain match on its own can also simply mean the provider reused a known address.

## Known providers (built in)

The tool ships with profiles for these providers. New scans are automatically compared against them.

| Provider | Categories | Streams | Key identifiers |
|---|---|---|---|
| T-Rex | ~830 | ~55,500 | Pipe separators, no star chars, superscript unicode, logo IPs 103.176.90.x |
| Strong8k | ~900 | ~56,700 | Pipe separators, 8K sport category, sun symbol, shared logo IPs with T-Rex |
| Mega | ~320 | ~27,500 | Pipe separators, logos on line.megacdn.live |
| Dream4K | ~460 | unknown | Uses U+272A star, French-first category order, aggressive IP blocking |

Everything else is up to you: see [Building your own provider database](#building-your-own-provider-database).

# Command line reference

Every button is also a command. Run `iptv-fingerprint <command> --help` to see all options for a command.

| Command | Button | Purpose |
|---|---|---|
| `web` | | Start the browser app (also what runs with no command) |
| `collect` | Identify a provider | Scan, save and match a provider |
| `match` | Re-match a scan | Match a saved scan again |
| `compare` | Compare two scans | Side-by-side of two saved scans |
| `enrich` | Add domains / EPG | Add domains or EPG URLs to a saved scan |
| `promote` | Save as known provider | Add a saved scan to your provider database |
| `merge` | Merge scans | Fold one scan into another |
| `alias` | Aliases | Add or remove alias names |
| `investigate` | Investigate a domain | Infrastructure lookup without a login |
| `export` | Export channels to CSV | Channel list to a spreadsheet |
| `list` | Saved scans | List saved scans |
| `delete` | Delete a scan | Remove a saved scan |

# Optional API keys

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

# Data sources

DNS uses Google DNS-over-HTTPS and WHOIS uses RDAP, so no `dig` or `whois` install is needed. Other free, keyless sources: crt.sh certificate transparency, HTTP header analysis, reverse IP lookups via HackerTarget, IP geolocation via ipinfo.io, and Shodan InternetDB.
