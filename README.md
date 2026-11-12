# Film School

A phone-first web app for two people's watchlists: what to watch together and on what kind of night, what each person watches alone, a self-made film-school curriculum with notes, verdicts after watching, and a dice roll for when nobody can decide.

It is a static site with no server and no build step. The lists live as JSON files in a separate, private GitHub repository, which the app reads and writes through GitHub's API using a token stored on each device. This repository holds only the app; it contains none of the data.

## What it does

- **Together**: shared picks grouped by the kind of night they need (light, dense, heavy, or "test one episode first"), then by shelf (Comedies, Monsters & scares…).
- **Solo** and **Tristan's queue**: one list per person.
- **Store picks**: films to play on the screens during a shift at a video shop. Tick one when it's played; it comes back after six months.
- **Rent**: films that can't be downloaded, split by whether the local video shop's catalogue has them.
- **Incoming**: picks found by an automated monthly pass wait here until kept or binned.
- **Film school**: volumes of ten films with spoiler-light notes before watching, full notes after, and diary questions.
- **Title pages**: poster, credits, links to Letterboxd, IMDb and TMDB, where to get it, the one-line pitch, notes, verdicts, your Letterboxd history, and similar titles from your own lists.
- **Watched**: once a title's audience has seen it (a verdict, or a Letterboxd log), it drops to a collapsed Watched group at the bottom of its list.
- **Roll the dice**: a random pick from any list, narrowed by night, length, films or series, and whether it's on disk or at the shop.
- Works offline once opened, and can be installed to a phone's home screen.

## How it works

```
 phone browser ── reads/writes JSON ──▶ api.github.com ──▶ private data repo
       │
       └── loads poster images ──▶ image.tmdb.org
```

Those are the only two places the app connects to; the content security policy in `index.html` blocks everything else.

- **Signing in.** On first open the app asks for the data repo's name and a GitHub token. Both are kept in that browser's localStorage and are sent only to api.github.com.
- **Reading.** Each JSON file is fetched through GitHub's contents API and kept in the browser's IndexedDB with its ETag, so a file that hasn't changed isn't downloaded again and the app opens without a connection. The files the lists need come first; credits, people and availability load behind them.
- **Saving.** Every change (adding to a list, a verdict, a pitch, ticking a store pick) rewrites `data/curation.json` and commits it, one commit per change with a readable message. If the file changed elsewhere in the meantime, GitHub refuses the write, and the app fetches the new copy and applies the same change to it, so two phones never overwrite each other.
- **Everything else** (looking titles up on TMDB, importing a Letterboxd export, checking Radarr, checking the shop's catalogue, finding new releases) is done by scripts and GitHub Actions in the data repo, not here. The app only reads what they write.

## Setting up your own copy

You need a GitHub account. Nothing needs installing.

1. **Copy this repository** (fork it, or create a new repository and upload these files).
2. **Point it at your data.** In `config.js`, set `repo` to `your-name/your-data-repo`.
3. **Create the data repo.** Make a new repository, set it to **private**, and add at least `data/titles.json` and `data/curation.json` in the formats described below. Everything else is optional.
4. **Publish the app.** In the app repository: Settings → Pages → Build and deployment → Deploy from a branch → `main`, folder `/ (root)`. The empty `.nojekyll` file tells GitHub to serve the files as they are. After a minute the app is at `https://your-name.github.io/your-app-repo/`.
5. **Make a token.** On GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Under Repository access choose "Only select repositories" and pick the data repo. Under Permissions → Repository permissions set **Contents** to "Read and write". Nothing else is needed. Give it an expiry date you're comfortable with.
6. **Open the app** on each phone and paste the token. Each device keeps its own copy; "Sign out on this device" in Settings removes it.

To try it on a computer first, serve the folder with any static web server (for example `python3 -m http.server 8000` in this folder, then open `http://localhost:8000`). It has to be served; opening `index.html` directly from disk won't load the modules.

When you change the app, bump `BUILD` in `js/main.js` (it's shown in Settings, so you can tell which version a phone is running) and `CACHE` in `sw.js` (so each phone's offline copy is replaced rather than added to). If you add a file, also add it to `SHELL` in `sw.js` so it works offline.

## The data repo

```
data/titles.json       required  every film and series the lists mention
data/curation.json     required  the lists, verdicts and pitches; the only file the app writes
data/letterboxd.json   optional  ratings, diary and lists from a Letterboxd export
data/details.json      optional  credits and full synopses
data/people.json       optional  names and photos for the people in credits
data/radarr.json       optional  which films Radarr has on disk
data/wlv.json          optional  which titles the video shop stocks
notes/<title id>.md    optional  film-school notes, one file per title
volumes/vol-01.md      optional  film-school volumes, numbered from 01
```

Optional files that are missing simply leave their part of the app empty. The examples below are made up; only the field names matter.

### data/titles.json

A list with one record per title. The `id` links everything else together; any stable lowercase id works, and title-plus-year is the convention used here.

```json
[
  {
    "id": "the-thing-1982",
    "title": "The Thing",
    "year": 1982,
    "kind": "film",
    "runtime": 109,
    "genres": ["Horror", "Science Fiction"],
    "by": "Directed by John Carpenter",
    "syn": "A short synopsis shown in lists.",
    "poster": "/abc123.jpg",
    "tmdb": { "type": "movie", "id": 1091 },
    "imdb": "tt0084787",
    "match": "auto"
  }
]
```

- `kind` is `film`, `series` or `standup`. Series can have `seasons`.
- `poster` is a TMDB image path; the app adds `https://image.tmdb.org/t/p/w154` and so on in front.
- Optional: `original` (title in its own language), `lb` (Letterboxd URL), `aliases` (old ids that now point here).
- `match` is the state of the TMDB lookup: `auto` (found), `confirmed` (checked by hand), `review` (unsure, with a `candidates` list of `{ type, id, title, year, poster }` to choose from), `notfound`, or `none` (deliberately not on TMDB). The title page shows a box asking for help for `review`, `notfound` and `none`.

### data/curation.json

```json
{
  "entries": [
    { "t": "the-thing-1982", "tier": "B", "energy": "dense", "section": "Monsters & scares", "status": "queued", "order": 1, "star": true, "note": "Optional note" }
  ],
  "verdicts": [
    { "id": "v1", "t": "the-thing-1982", "viewer": "both", "reaction": "loved", "note": "Optional", "date": "2026-10-31" }
  ],
  "pitches": { "the-thing-1982": "One line on why he'd like it." },
  "calibration": [ { "date": "2026-07", "text": "Something learned about your taste." } ],
  "sectionOrder": ["Comedies", "Monsters & scares"],
  "storeRules": ["No subtitled films on the shop screens."]
}
```

An **entry** puts a title on a list; a title can have several. `tier` says which list, and what takes the title off it:

| tier | list | leaves the list when |
|---|---|---|
| `B` | Together | there's a verdict with viewer `both` |
| `B?` | Together, test one episode first | the same |
| `M` | Solo | there's a verdict with viewer `meta` or `both`, or Meta has logged it on Letterboxd |
| `T` | Tristan's queue | there's a verdict with viewer `tristan` or `both` |
| `W` | Store picks | never; it's ticked as played and comes back after six months |
| `R` | Rent | it's marked rented |
| `C` | Coming soon | it's moved to a real list once it's out |

- `energy` is `light`, `dense` or `heavy`, and sets the colour and the Together group.
- `section` is the shelf name. `sectionOrder` lists shelf names in the order to show them; shelves not listed follow in the order they first appear.
- `status` is `queued`, `ongoing`, `done` or `dropped`. `done` and `dropped` also take an entry off its list; `ongoing` keeps it on regardless of verdicts. Entries that leave a list move to its Watched group.
- `star: true` marks a highest-confidence pick; `order` is the position within a shelf.

A **verdict** records a reaction after watching. `viewer` is `both`, `meta` or `tristan`; `reaction` is one of `favourite`, `loved`, `liked`, `mixed`, `bounced`, `disliked`, `seen`.

The app also writes these, and the data repo's scripts read them:

- `added`: titles typed into "Add a title", waiting for the TMDB lookup.
- `matchOverrides`: corrections from "Fix the match" (`{ type, id }`, `"retry"` or `"none"`).
- `declined`: titles removed by hand, so automated passes don't add them back.
- On entries: `played` (store picks), `rented` (rent list), and `auto` / `found` (Incoming, set by the monthly pass).

Commits for new titles and match fixes end in `[enrich]`, which is what the data repo's lookup workflow listens for. Without such a workflow, a new title shows "Looking it up" until its record in `titles.json` is filled in and its `match` set.

### data/letterboxd.json

```json
{
  "username": "you",
  "exportedAt": "2026-11-12",
  "films": { "the-thing-1982": { "watched": "2025-10-31", "rating": 4.5, "liked": true, "watchlist": null } },
  "diary": [ { "t": "the-thing-1982", "date": "2025-10-31", "logged": "2025-11-01", "rating": 4.5, "rewatch": false, "tags": [], "review": "Optional, markdown" } ],
  "lists": { "A list name": { "url": "https://boxd.it/…", "items": ["the-thing-1982"] } }
}
```

Letterboxd's own export is a set of CSV files; turning it into this shape, with ids matching `titles.json`, is the data repo's job.

### data/details.json and data/people.json

```json
{ "the-thing-1982": { "overview": "The full TMDB synopsis.", "credits": [ { "p": "p1", "r": "director" }, { "p": "p2", "r": "actor", "c": "MacReady", "o": 0 } ] } }
```

```json
{ "p1": { "name": "A Director", "img": "/def456.jpg", "dept": "Directing" } }
```

In a credit, `p` is the person's id in `people.json`, `r` the role (`director`, `creator`, `writer`, `producer`, `composer`, `cinematographer` or `actor`), `c` the character and `o` the billing order. They're kept out of `titles.json` because together they're several times its size and only the title, person and search pages need them.

### data/radarr.json and data/wlv.json

```json
{ "exportedAt": "2026-11-12", "titles": { "the-thing-1982": { "slug": "the-thing-1982", "file": true, "monitored": true } } }
```

```json
{ "checkedAt": "2026-11-01", "titles": { "the-thing-1982": { "checked": "2026-11-01", "items": [ { "slug": "/the-thing-1982", "name": "The Thing", "formats": ["DVD", "Blu-ray"], "total": 2 } ] } } }
```

Radarr links are built from the address entered in Settings plus `/movie/<slug>`. The app never connects to Radarr itself; the address only makes the links. Shop links are the shop's address plus the item's `slug`; an item with `total: 0` counts as not stocked. To use a different shop, change `WLV_STORE` in `js/avail.js` and the shop's name in the labels.

### notes and volumes

A note is markdown with a small header, then paragraphs that start with a bold label:

```markdown
---
title: The Thing
heading: John Carpenter · USA · 1982 · 109 min
volume: 2
number: 4
---

**Before you watch.** Setup and themes, no plot turns.

**The people.** Who made it.

**After you watch.** Everything, spoilers included.

**Diary questions.** (1) First question? (2) Second? (3) Third?
```

"Before" opens by default, "After" stays folded behind a spoiler warning until tapped, and "Diary questions" becomes a numbered list. `volume` and `number` are optional and link the note to its volume.

A volume file lists its ten films in its header, then has an introduction, a line containing only `---`, and a guide to keeping the diary:

```markdown
---
number: 1
title: Foundations
films:
  - the-cabinet-of-dr-caligari-1920
  - nosferatu-1922
---

Introduction…

---

How to use the diary…
```

## Files in this repository

| file | what it does |
|---|---|
| `index.html` | The page shell: bottom bar, the sheet that forms open in, and the security policy |
| `config.js` | The data repo's name. The only file to edit when setting up |
| `css/app.css` | All styling, in screen order |
| `js/main.js` | Starts the app: picks the page from the address, handles taps and form submissions, saves |
| `js/store.js` | Loads the data, builds lookup tables, decides who has seen what, saves `curation.json` |
| `js/gh.js` | Talks to the GitHub API and keeps the offline copy in IndexedDB |
| `js/ui.js` | Gathers the five view files below into one import |
| `js/parts.js` | Shared pieces: rows, posters, shelves, filters, the Watched group, icons |
| `js/lists.js` | Together, Solo, Store picks, Tristan's queue, Film school |
| `js/titlepage.js` | The title page and the person page |
| `js/more.js` | The More menu, Incoming, Rent, Search, Unsorted, Verdicts, Check matches |
| `js/forms.js` | Every form, the login page and the loading screen |
| `js/avail.js` | Radarr and video shop availability, and the Radarr address setting |
| `js/roll.js` | Roll the dice: which titles qualify, the pick, the page |
| `js/dice.js` | The dice faces, the tumble, and the sound (made with Web Audio, no sound files) |
| `js/md.js` | HTML escaping and a small markdown reader for notes |
| `sw.js` | The service worker that keeps the app's own files for offline use |
| `manifest.webmanifest`, `icons/` | What the phone uses when the app is added to the home screen |
| `fonts/` | Inter and Poppins, bundled so no font service is contacted |

Every page is built as a string of HTML by a function that takes the data and returns markup; `main.js` puts it on the page. Buttons carry `data-act="…"` and forms `data-form="…"`, and `main.js` has one table of handlers for each, so there are no inline scripts anywhere (the security policy wouldn't run them anyway). Anything that comes from the data passes through `esc()` before it reaches the page.

## Privacy and security

- **The data stays in your private repo.** The app is public code with no data in it; the lists are read from the private repo at run time. If the repo you connect turns out to be public, the app warns you.
- **The token lives on each device**, in the browser's localStorage. Anyone who can use that unlocked browser can use the token, so scope it to the one data repo with only Contents read/write, and give it an expiry. Signing out on a device deletes the token, the Radarr address and the offline copy from it.
- **Only GitHub and TMDB are contacted.** The security policy forbids scripts, styles, fonts or connections from anywhere else, and the page sends no referrer. Poster images come from TMDB, which therefore sees the phone's IP address; nothing else is shared with it.
- **No inline code, no framing.** The app refuses to draw inside another site's frame, so its buttons can't be overlaid by a look-alike page. Links out open in a new tab with `noopener noreferrer`.
- **Data is escaped.** Titles, notes and anything else from the data repo are escaped before display; notes support a limited markdown with `http(s)` links only.

## Credits

Posters, credits and synopses come from [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB.

Fonts: [Inter](https://github.com/rsms/inter) and [Poppins](https://github.com/itfoundry/Poppins), both under the SIL Open Font License 1.1 (`fonts/Inter-OFL.txt`, `fonts/Poppins-OFL.txt`).
