---
title: Editor Image Upload & Paste Plan
section: Development
---

# Editor Image Upload & Paste Plan

## Current state (2026-03-20)

- Backend foundations are implemented:
  - `note_images` table + model + relations
  - workspace-scoped upload endpoint: `POST /w/{workspace}/images`
  - workspace-scoped serve endpoint: `GET /w/{workspace}/images/{image}`
  - workspace storage disk foundation: `workspaces.storage_disk` + image folder prefix
- Block editor integration is implemented:
  - real upload adapter wired to `POST /w/{workspace}/images`
  - uploads now include `note_id` metadata for ownership/cleanup linkage
  - image paste (clipboard file) upload + insert
  - image drag/drop upload + insert
- Cleanup lifecycle foundations are implemented:
  - `notes:prune-images` command marks unreferenced/stale uploads as `orphaned`
  - `notes:prune-images` deletes expired orphaned files + rows
  - scheduler runs image prune daily
- Legacy editor remains unchanged for now (still uses demo upload handler).

## Goal

Add production-grade support for:

1. Uploading images from file picker/drag-drop in editor.
2. Pasting images from clipboard (screenshots/copied files) directly into editor.

Both flows should insert a normal image node in the note content, survive reloads, and respect workspace/user permissions.

## Scope

In scope:

- Block editor image upload + paste support.
- Storage, metadata persistence, authorization, cleanup.
- UX states for uploading/success/error.
- Tests (feature + browser) for critical behavior.

Out of scope (later):

- Image transforms/cropping.
- OCR/search indexing of image text.
- CDN optimization and responsive derivatives.

## Architecture decisions

- Store image binaries via Laravel filesystem disk (`public` first, S3-ready configuration).
- Workspace storage is disk-based and should be generic (`workspaces.storage_disk`) so later non-image assets can reuse the same storage strategy.
- Image uploads use the workspace storage disk plus a dedicated image folder prefix.
- Introduce a first-class `note_images` table for metadata and ownership.
- Persist stable URLs in editor document JSON through an app route, not raw storage paths.
- Keep image access workspace-scoped and permission-checked.

## Data model

Create `note_images` table (name can be adjusted to project naming conventions):

- `id` (uuid)
- `workspace_id` (uuid, indexed)
- `note_id` (uuid, nullable while uploading)
- `uploaded_by` (user id)
- `disk` (string)
- `path` (string)
- `filename` (string)
- `mime_type` (string)
- `size_bytes` (unsigned bigint)
- `width` / `height` (unsigned int, nullable)
- `sha256` (string, nullable; for dedupe)
- `status` (`active`, `orphaned`, `deleted`)
- timestamps

## API plan

### 1) Upload endpoint

`POST /w/{workspace}/images`

- Auth required; user must be workspace member.
- Accept single file (`image/*`) multipart upload.
- Validate:
  - mime whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`)
  - max size (start with existing 5MB constant or configurable env)
- Store file on configured disk (`notes-images/{workspace_id}/{yyyy}/{mm}/{uuid}.{ext}`).
- Resolve disk via workspace storage setting:
  - `workspaces.storage_disk` if set and allowed
  - otherwise `note-images.default_disk`
- Store file under image folder prefix on that disk.
- Persist metadata row in `note_images`.
- Return payload:
  - `id`
  - `src` (application route to serve image)
  - `width`/`height`
  - `alt` default

### 2) Serve endpoint

`GET /w/{workspace}/images/{image}`

- Authorize workspace membership.
- Stream/redirect file from storage.
- Add caching headers.

### 3) Delete endpoint (optional in phase 1, required in phase 2)

`DELETE /w/{workspace}/images/{image}`

- Soft delete metadata + physical file removal policy.

## Frontend plan

### 1) Replace demo upload handler

- Block editor: done via dedicated adapter (`resources/js/lib/block-note-image-upload.ts`) and `noteImageUploadUrl` prop from backend.
- Legacy editor: still pending migration to real endpoint.
- Keep progress + abort behavior.
- On success, return real `src` for inserted image node.

### 2) Paste support extension

Add a dedicated Tiptap extension/plugin that handles `paste` events:

- If clipboard contains image files:
  - upload each image using same upload adapter
  - insert resulting image nodes at selection
- If clipboard contains `data:image/...;base64,...`:
  - convert to `File`, upload, insert (done)
- If clipboard contains plain URLs only:
  - do nothing in phase 1 (avoid SSRF/proxy complexity)

### 3) UX behavior

- Show temporary upload node/progress state while uploading.
- On error, show inline retry/remove action.
- Preserve cursor position and surrounding block structure.
- Support multiple pasted images (bounded by per-action limit).

## Security and limits

- Enforce server-side file type + size validation.
- Do not trust client MIME; verify with Laravel file inspection.
- Strip executable extensions and normalize filenames.
- Apply rate limiting to upload endpoint.
- Ensure workspace-level authorization on upload and retrieval.

### Config / env

- `NOTE_IMAGE_DEFAULT_DISK` (default: `public`)
- `NOTE_IMAGE_ALLOWED_DISKS` (comma-separated)
- `NOTE_IMAGE_FOLDER` (default: `uploads/images`)
- `NOTE_IMAGE_MAX_UPLOAD_MB` (default: `5`)
- `NOTE_IMAGE_UNATTACHED_GRACE_HOURS` (default: `24`)
- `NOTE_IMAGE_ORPHAN_RETENTION_DAYS` (default: `7`)

## Cleanup lifecycle

- Mark images as `orphaned` when no longer referenced in note content after save.
- Add scheduled cleanup command/job:
  - permanently delete orphaned images older than configured grace period (e.g., 7 days).
- On hard note delete / workspace clear:
  - delete linked images and files.

Current implementation:

- `notes:prune-images` marks as orphaned when:
  - upload stayed unattached (`note_id = null`) beyond `NOTE_IMAGE_UNATTACHED_GRACE_HOURS`
  - linked note is missing/trashed
  - linked note content no longer references `/images/{image-id}`
- `notes:prune-images` deletes orphaned images after `NOTE_IMAGE_ORPHAN_RETENTION_DAYS`.

## Testing plan

### Feature tests (Pest)

- Upload allowed for workspace member.
- Upload forbidden for non-member.
- Validation failures (size/type).
- Serve endpoint authorization.
- Note delete clears linked images.

### Browser tests (Pest Browser)

- Upload via toolbar/file picker inserts image and persists after reload.
- Paste clipboard image inserts image and persists after save/reload.
- Upload error state shown and can retry/remove.
- List/task/blockquote context remains intact around inserted image.

## Rollout plan

Phase 1:

- Backend upload + serve endpoints. (done)
- Real upload adapter in block editor. (done)
- File picker and drag-drop for block editor. (done)
- Legacy editor integration remains out of scope for this phase.

Phase 2:

- Clipboard paste image support.
  - clipboard image files: done
  - clipboard `data:image/*;base64`: done
- Error/retry UX hardening.

Phase 3:

- Orphan cleanup + retention policies. (done)
- Optional S3/CDN optimizations.

## Acceptance criteria

- User can upload image from editor and see it immediately.
- User can paste screenshot into editor and it appears as image.
- Reloading note keeps image rendered (no broken placeholder URLs).
- Unauthorized users cannot upload or fetch workspace images.
- Deleting note/workspace removes related images according to policy.

## Implementation checklist

- [x] Create `note_images` migration + model + relations.
- [x] Add workspace-level generic storage disk groundwork (`workspaces.storage_disk`) and image folder path convention.
- [x] Add upload/serve (and optional delete) controller + routes + policies.
- [x] Replace frontend demo `handleImageUpload()` with real API adapter for block editor only.
- [x] Add paste-image extension and wire into block editor extensions (clipboard image files + drag/drop).
- [x] Add backend feature tests.
- [ ] Add editor browser tests for upload/paste flows. (test added, currently unstable in automation for toolbar file attach path)
- [ ] Add editor browser tests for upload/paste flows. (tests added for toolbar upload and base64 paste; currently unstable in this automation environment)
- [ ] Add editor browser tests for upload/paste flows. (deterministic browser tests are stable: toolbar insertion + base64 insert hook; real backend browser upload persistence case is present but skipped pending stable authenticated upload automation)
- [x] Add cleanup command/job for orphaned images.
- [x] Document env/config (`NOTE_IMAGE_MAX_UPLOAD_MB`, disk config, retention days).
