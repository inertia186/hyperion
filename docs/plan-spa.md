# SPA Rewrite Plan

## Summary

Hyperion should be reimplemented as a React SPA focused on curation. The
current Bootstrap/Haml UI works for expert users, but the interface is hard for
normal users to understand because the main workflows are spread across dense
forms, tables, buttons, modals, and sidebar controls.

The SPA should replace the root user experience while Rails remains the backend,
session authority, and data owner. Existing Haml/Bootstrap routes should stay in
place temporarily as a fallback during the migration.

The primary product goal is to help a Hive curator reduce the current 7-day
curation window to a manageable unread set using read state, ignored tags, muted
authors, favorite tags, past tags, sorting, and fast post preview.

## Branching and Migration

- Branch `spa` from the current `haf` branch.
- The first commit on `spa` should only add this plan.
- Keep the HafSQL/HAF indexing work unchanged.
- Add the SPA incrementally in later commits.
- Serve the SPA from the root route once the core curation workflow is usable.
- Keep existing Haml routes available during the migration for fallback and
  behavioral comparison.

## Frontend Direction

- Use React with Vite.
- Use Tailwind CSS for the SPA UI.
- Do not carry Bootstrap visual conventions into the SPA.
- Preserve Rails asset/build integration where practical, but do not let the
  current jQuery/Stimulus code dictate the SPA architecture.
- Treat the existing Bootstrap views as workflow references, not as a design
  system to preserve.

## Product UX

The main SPA screen should be a curation inbox.

Core layout:

- A filter/control area for active query state, favorites, ignored tags, mute
  state, and curation actions.
- A dense post list optimized for scanning titles, authors, tags, age, read
  state, and lightweight metadata.
- A persistent side preview pane for the selected post, so users can inspect and
  mark posts without losing list context.

Core workflows:

- View the unread 7-day curation window.
- Filter by tag, category, author, app, excluded tags, and special views.
- Sort by latest, oldest, prolific author, non-prolific author, most tags, and
  least tags.
- Mark one post read or unread.
- Mark the currently shown page as read.
- Ignore or unignore tags.
- Toggle muted authors on and off.
- Toggle only favorite tags.
- Manage favorite and past tags.
- Preview a post body lazily.
- Navigate efficiently through posts while preserving curation context.

The first SPA scope should include core curation parity:

- session awareness
- post list
- filter/query controls
- read/unread actions
- mark shown as read
- ignored tag controls
- muted-author toggle
- favorite tag controls
- past tag controls
- side-pane preview

Full replacement of secondary tag administration screens can come after the
core inbox is working.

## Backend/API Direction

Add explicit JSON v1 endpoints while keeping the existing Rails HTML routes.
Rails sessions remain the source of authentication state.

Recommended endpoint groups:

- `GET /api/v1/session`
  - Return current account state, session preferences, muted authors, favorite
    tags, ignored tags, past tags, and basic counts needed to render the shell.
- `GET /api/v1/posts`
  - Accept the existing query semantics: tags, excluded tags, author, app, sort,
    limit, page, `only_read`, `only_ignored`, `only_deleted`, and
    `only_blacklisted`.
  - Return posts, pagination, read ids, tags by post, communities by category,
    related tags, related authors, counts, and normalized query state.
- `GET /api/v1/posts/:id`
  - Return preview/detail data for a post.
  - Load body lazily using the existing HafSQL/RPC fallback behavior.
- `PATCH /api/v1/posts/:id/read`
  - Mark one post as read.
- `DELETE /api/v1/posts/:id/read`
  - Mark one post as unread.
- `PATCH /api/v1/posts/read`
  - Mark a list of post ids as read.
- `POST /api/v1/tags/:tag/ignored`
  - Ignore a tag.
- `DELETE /api/v1/tags/:tag/ignored`
  - Stop ignoring a tag.
- `POST /api/v1/tags/:tag/favorite`
  - Favorite a tag.
- `DELETE /api/v1/tags/:tag/favorite`
  - Remove a favorite tag.
- `DELETE /api/v1/past_tags/:tag`
  - Remove one past tag.
- `PATCH /api/v1/preferences/mute`
  - Toggle muted-author filtering.
- `PATCH /api/v1/preferences/only_favorite_tags`
  - Toggle favorite-tag-only filtering.

API responses should be shaped for the SPA and should not require the frontend
to infer Rails view state from HTML conventions.

## Important Behavior to Preserve

- Ignored tags are separate from muted authors.
- Disable Mute allows posts from authors in `account.muted_authors`.
- Enable Mute excludes posts from authors in `account.muted_authors`.
- Toggling mute must not include ignored tags in normal results.
- Toggling mute must not record the current tag as tag activity.
- Ignored tags stay excluded from normal unread results unless the user is in an
  ignored-posts view or explicitly unignores the tag.
- Post bodies should continue to load lazily.
- The current 7-day active curation window remains the default.
- HafSQL remains the primary indexing source.
- Current compatibility behavior around Hive follow refresh should remain
  isolated in the backend.

## Testing Plan

Keep the existing Rails test suite passing.

Add request tests for JSON v1 endpoints using the curated fixtures:

- normal unread results exclude read posts
- normal unread results exclude ignored tags
- muted authors appear when mute is disabled
- muted authors disappear when mute is enabled
- deleted and blacklisted views return their specialized sets
- ignored view returns ignored-tag posts
- dotted author names route and filter correctly
- preview endpoint loads missing body lazily

Add frontend tests after React scaffolding:

- session bootstrap renders the authenticated shell
- query state renders from the posts API response
- selecting a post opens the side preview
- read/unread updates list state without a full page reload
- mark shown as read updates the current list
- mute toggle changes author visibility without changing ignored-tag behavior
- favorite and past tag controls update local state after successful API calls

## Assumptions

- `spa` is based on `haf`.
- Rails continues to own authentication, indexing, persistence, and Hive/HAF
  compatibility.
- The first SPA implementation targets the post curation inbox, not every
  secondary admin page.
- Existing Haml/Bootstrap pages remain available until the SPA is proven stable.
- React + Vite + Tailwind is the default frontend stack for the SPA.
