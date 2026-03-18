---
title: Full-Text Search — Design & Implementation Plan
section: Development
---

# Full-Text Search — Design & Implementation Plan

## Context

- **Production stack:** Laravel Forge + MySQL
- **Phase 1:** Task content search (tasks page)
- **Phase 2:** Note search (title, body, mentions, hashtags, properties)

---

## Options Considered

### Option A: MySQL Full-Text Search (native)

MySQL supports `FULLTEXT` indexes with `MATCH … AGAINST` queries. The database driver in Laravel Scout uses this under the hood.

**Pros**
- Zero extra infrastructure — works on the existing Forge server
- `content_text` and `note_title` on `note_tasks` are plain text columns, ideal for FULLTEXT
- Multi-column FULLTEXT index for combined relevance
- Relevance scoring via `MATCH … AGAINST` in natural-language mode
- Simple migration: one `ALTER TABLE … ADD FULLTEXT INDEX`

**Cons**
- Minimum word length (MySQL default: 3–4 chars; configurable)
- No typo/fuzzy tolerance — "proejct" will not match "project"
- Cannot index JSON array columns (`hashtags`, `mentions`) directly
- Field weight control is limited (column weighting via separate MATCH clauses)
- Does not scale elegantly to note body search (JSON content needs a separate extracted-text column)

---

### Option B: Laravel Scout + Meilisearch (recommended)

[Meilisearch](https://www.meilisearch.com/) is a Rust-based open-source search engine. It runs as a single binary daemon — easily installed on the existing Forge server with a systemd service. Laravel Scout provides the glue between Eloquent models and the index.

**Pros**
- **Typo tolerance** — users searching for "projct" will still find "project"
- **Custom field weights** — title can be scored 5× higher than body text
- **Filterable attributes** — filter by `workspace_id`, status, date alongside search
- **JSON array indexing** — `mentions` and `hashtags` arrays are indexed natively
- **Scout integration** — model `Searchable` trait auto-syncs on create/update/delete
- **Faceted search** — can count results by status, workspace, etc.
- **Self-hosted** — no SaaS dependency or per-search fees
- **Extends to notes** — one additional `NoteSearch` index with extracted content

**Cons**
- One extra service to manage on the Forge server (~150–300 MB RAM typical)
- Must keep Meilisearch running (Forge supervisor daemon handles this)
- Initial indexing run needed after install

---

### Option C: Algolia / Typesense

Both are hosted or self-hosted alternatives. Algolia is excellent but charges per search/record, which adds up. Typesense is a good Meilisearch alternative. Not recommended over Meilisearch for this setup.

---

## Recommendation

### Phase 1 (Tasks): MySQL Full-Text Search

For task search the data is straightforward: `content_text` is already plain text, and `note_title`/`parent_note_title` are text columns. MySQL FTS is sufficient here and requires zero infrastructure changes.

**Index columns for tasks:**
```sql
ALTER TABLE note_tasks ADD FULLTEXT INDEX fts_note_tasks (content_text, note_title, parent_note_title);
```

Hashtags and mentions are not in the FTS index, but the tasks page already has dedicated filter UI for those. The search box covers free-text content.

**Simulated weighting** (MySQL trick — run two MATCH clauses):
```sql
SELECT *,
    (MATCH(note_title, parent_note_title) AGAINST (? IN NATURAL LANGUAGE MODE) * 3.0
     + MATCH(content_text) AGAINST (? IN NATURAL LANGUAGE MODE)) AS relevance
FROM note_tasks
WHERE MATCH(content_text, note_title, parent_note_title) AGAINST (? IN BOOLEAN MODE)
ORDER BY relevance DESC
```

This gives note title matches a 3× relevance boost without external infrastructure.

---

### Phase 2 (Notes): Migrate to Scout + Meilisearch

When note search is introduced, switch both tasks and notes to Meilisearch via Laravel Scout. The migration path is clean:

1. Install Meilisearch on Forge (`systemd` daemon)
2. `composer require laravel/scout meilisearch/meilisearch-php`
3. Add `Searchable` to `NoteTask` and `Note` (with a `toSearchableArray()` method)
4. Replace the MySQL FTS query in `TasksController` with `NoteTask::search($q)->where('workspace_id', $id)->paginate(50)`
5. Configure field weights in the Meilisearch index settings

---

## Meilisearch Index Design (for reference when Phase 2 starts)

### NoteTask index

| Field | Weight | Notes |
|---|---|---|
| `note_title` | 5.0 | Searching by note name is the most common intent |
| `parent_note_title` | 3.0 | |
| `content_text` | 1.0 | Main task body |
| `hashtags` | 2.0 | Meilisearch indexes string arrays natively |
| `mentions` | 1.5 | |

Filterable attributes: `workspace_id`, `checked`, `task_status`, `due_date`, `journal_date`

### Note index

| Field | Weight | Notes |
|---|---|---|
| `title` | 5.0 | |
| `content_text` | 1.0 | Extracted from JSON `content` column via `NoteWordCountExtractor` pattern |
| `tags` | 2.5 | Extracted from `properties` |
| `mentions` | 1.5 | From `NoteMetaExtractor` |
| `hashtags` | 2.0 | |

Filterable attributes: `workspace_id`, `type`, `journal_granularity`

### Keeping the index in sync

Scout's `Searchable` trait hooks into Eloquent's `saved` and `deleted` events automatically. The `NoteObserver` already runs on every save — no extra wiring needed. For bulk reindexing:

```bash
php artisan scout:import "App\Models\NoteTask"
php artisan scout:import "App\Models\Note"
```

---

## Forge Setup (Meilisearch daemon)

> Status: laravel/scout + meilisearch/meilisearch-php installed locally (2026-03-18). Meilisearch running via brew locally. **Production Forge setup still needed.**

### 1. Install binary on the server (SSH)

```bash
curl -L https://install.meilisearch.com | sh
sudo mv ./meilisearch /usr/bin/meilisearch
sudo mkdir -p /var/lib/meilisearch/data
sudo chown -R forge:forge /var/lib/meilisearch
```

### 2. Create a Forge Daemon

Forge → site → **Daemons** → New Daemon:

| Field | Value |
|---|---|
| Command | `meilisearch --db-path /var/lib/meilisearch/data --http-addr 127.0.0.1:7700 --master-key YOUR_STRONG_KEY` |
| User | `forge` |
| Directory | `/var/lib/meilisearch` |
| Processes | `1` |

Generate a key: `openssl rand -hex 32`

Forge wraps this in Supervisor — auto-restarts on crash.

### 3. Set env vars in Forge → Environment

```ini
SCOUT_DRIVER=meilisearch
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_KEY=YOUR_STRONG_KEY
```

`MEILISEARCH_KEY` must match `--master-key` in the daemon command.

### 4. Add to deploy script

```bash
php artisan scout:sync-index-settings
```

Pushes filterable/sortable attribute config to Meilisearch. Idempotent — safe to run on every deploy.

### 5. Initial index import (run once after Searchable trait is added)

```bash
php artisan scout:import "App\Models\NoteTask"
```

### Notes

- `127.0.0.1:7700` — Meilisearch is not publicly reachable, only the app talks to it
- Data directory persists on disk; if server is reprovisioned, re-run `scout:import`
- Memory: ~150–300 MB RAM idle

---

## Decision Summary

| | Phase 1 (tasks now) | Phase 2 (notes later) |
|---|---|---|
| **Engine** | MySQL FULLTEXT | Meilisearch via Scout |
| **Infrastructure** | None | Forge daemon (~200 MB RAM) |
| **Typo tolerance** | No | Yes |
| **Field weighting** | Limited (manual SQL trick) | Full control |
| **JSON arrays (hashtags)** | No | Yes |
| **Migration effort** | Minimal | One Scout integration |
