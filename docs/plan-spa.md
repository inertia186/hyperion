# SPA Rewrite Status

## Summary

Hyperion now has a React SPA foundation focused on the core curation inbox.
Rails remains the backend, session authority, and data owner. The existing
Haml/Bootstrap routes remain available as fallback and behavioral comparison
pages during the migration.

The primary product goal remains helping a Hive curator reduce the current
7-day curation window to a manageable unread set using read state, ignored
tags, muted authors, favorite tags, past tags, sorting, and fast post preview.

## Current Implementation

- The `spa` branch is based on the HafSQL/HAF indexing work.
- The root route now serves the authenticated SPA shell.
- Existing Haml routes, including `/posts`, `/tags`, and `/sessions`, remain in
  place.
- React, Vite, and Tailwind are installed for the SPA.
- Local development can be launched with `bin/dev`, which starts Rails and
  Vite together, runs `nvm use` when available, and binds Rails/Vite for LAN
  testing.
- The development host allowlist includes `toto.local`, and Vite allows the
  same host for iPad/device testing on the local network.
- Legacy Bootstrap, jQuery, Stimulus, Sprockets, and jsbundling assets remain in
  place for the existing Haml screens.
- The curation query logic is shared through `PostCurationQuery`, so the API can
  preserve the current inbox behavior without scraping Rails view state.
- SPA keyboard behavior is centralized in `useCurationKeyboard`, keeping the
  list selection, preview focus, and read-and-move shortcuts consistent.
- The SPA shell is split into focused components under `app/frontend/src`, with
  session bootstrap separated from inbox state, list controls, preview, shortcut
  help, pagination, and tag panels.

## Frontend

The SPA first screen is the curation inbox.

Implemented core layout:

- Filter/control area for query state, sort, special views, mute state,
  favorite-only state, tag actions, and mark-shown-read.
- Dense post list for scanning title, author, category, tags, age, read state,
  muted-author state, and thumbnail.
- Persistent side preview pane for the selected post.
- Responsive inbox layout that stacks the preview below the list on smaller
  screens while keeping the sticky side preview on wide screens.
- Empty-list state for completed or filtered views.

Implemented workflows:

- View the unread 7-day curation window.
- Filter by tag, category, author token, app token, excluded tags, and special
  views.
- Sort by latest, oldest, prolific author, non-prolific author, most tags, and
  least tags.
- Mark one post read or unread.
- Mark the currently shown page as read.
- Ignore or unignore the active tag.
- Toggle muted-author filtering.
- Toggle only favorite tags.
- Favorite and unfavorite past tags.
- Remove past tags.
- Clear all past tags, ignored past tags, and ignored tags.
- Preview a post body lazily in the side pane.
- Show preview vote count, reply count, pending/paid payout, and external Hive
  explorer links.
- Upvote and downvote from the preview pane through Hivesigner or Hive
  Keychain.
- Move through posts while keeping list context.
- Ignore stale preview responses after fast selection changes.
- Show inline preview-load errors without replacing the post list.
- Clear the selected post and preview when read actions remove the last visible
  post.
- Navigate posts by keyboard with `j`/down for next and `k`/up for previous.
- Toggle preview focus with enter and return to list focus with escape.
- Move through posts while preview is active with `l`/right and `h`/left.
- Mark the selected post read and move with `>` or `<`.
- Scroll the active preview with space/page-down and shift-space/page-up,
  advancing to adjacent posts at scroll boundaries.
- Toggle the keyboard shortcut help panel with `?`.
- Show loading skeletons for the post list and preview pane.

Still intentionally deferred:

- Full replacement of secondary tag administration screens.
- Reply creation and reblog controls from legacy Hive frontends.
- Browser-level regression coverage beyond manual smoke testing.

## Backend/API

JSON v1 endpoints are implemented while keeping the existing Rails HTML routes.
Rails sessions remain the source of authentication state.

Implemented endpoints:

- `GET /api/v1/session`
  - Returns authenticated account state, session preferences, muted authors,
    favorite tags, ignored tags, past tags, shell counts, and Hivesigner
    capability.
- `GET /api/v1/posts`
  - Accepts the existing query semantics: tags, excluded tags, author, app,
    sort, limit, page, `only_read`, `only_ignored`, `only_deleted`, and
    `only_blacklisted`.
  - Returns posts, pagination, related tags, related authors, counts, tag state,
    and normalized query state.
- `GET /api/v1/posts/:id`
  - Returns preview/detail data for a post.
  - Loads missing bodies lazily through `Post#load_body!`, preserving the
    HafSQL/RPC fallback behavior.
  - Returns canonical, Hive, PeakD, Hiveblocks, hive-db, and scribe links for
    preview actions.
- `PATCH /api/v1/posts/:id/read`
  - Marks one post as read.
- `DELETE /api/v1/posts/:id/read`
  - Marks one post as unread.
- `PATCH /api/v1/posts/read`
  - Marks a list of post ids as read.
- `POST /api/v1/tags/:tag/ignored`
  - Ignores a tag.
- `DELETE /api/v1/tags/:tag/ignored`
  - Stops ignoring a tag and clears matching poisoned-pill tags.
- `POST /api/v1/tags/:tag/favorite`
  - Favorites a tag.
- `DELETE /api/v1/tags/:tag/favorite`
  - Removes a favorite tag.
- `DELETE /api/v1/past_tags/:tag`
  - Removes one past tag.
- `DELETE /api/v1/past_tags`
  - Clears all past tags, or only ignored past tags with `only_ignored=true`.
- `DELETE /api/v1/ignored_tags`
  - Clears ignored and poisoned-pill tags.
- `PATCH /api/v1/preferences/mute`
  - Toggles muted-author filtering and refreshes muted authors when enabling.
- `PATCH /api/v1/preferences/only_favorite_tags`
  - Toggles favorite-tag-only filtering.

API responses are shaped for the SPA and do not require the frontend to infer
Rails view state from HTML conventions.

## Preserved Behavior

- Ignored tags are separate from muted authors.
- Disable Mute allows posts from authors in `account.muted_authors`.
- Enable Mute excludes posts from authors in `account.muted_authors`.
- Toggling mute does not include ignored tags in normal results.
- Toggling mute does not record the current tag as tag activity.
- Ignored tags stay excluded from normal unread results unless the user is in an
  ignored-posts view or explicitly unignores the tag.
- Post bodies continue to load lazily.
- The current 7-day active curation window remains the default.
- HafSQL remains the primary indexing source.
- Hive follow refresh compatibility remains isolated in the backend.

## Testing Status

Verified:

- Full Rails test suite passes.
- Vite production build passes.
- Frontend Vitest suite passes.
- Manual browser smoke test passes.
- `bin/dev` syntax and executable bit are verified.

Backend API coverage includes:

- authenticated and unauthenticated session payloads
- normal unread results excluding read, ignored, old, deleted, and blacklisted
  posts
- muted authors appearing when mute is disabled
- muted authors disappearing when mute is enabled
- read, ignored, deleted, and blacklisted specialized views
- read/unread mutations
- mark-many-read mutation
- ignored, favorite, and past tag mutations
- preview endpoint lazy-loading missing body
- preview endpoint link payload
- bulk ignored/past tag cleanup mutations
- authenticated SPA shell rendering

Frontend coverage currently includes:

- session bootstrap
- post list rendering from the posts API response
- selected-post preview rendering
- keyboard selection with `j`, `k`, and arrow keys
- ignoring global shortcuts while query inputs are focused
- read-and-move shortcuts with `>` and `<`
- preview focus toggling with enter and escape
- preview scroll shortcuts and boundary movement
- keyboard shortcut help toggling with `?`
- keyboard shortcut help from an empty list
- stale preview response suppression
- inline preview error rendering
- last-post read-and-move empty-state handling
- preview chain stats and external links
- Keychain and Hivesigner vote flows
- bulk ignored/past tag cleanup actions

## Recommended Next Polish Pass

- Add browser-driven visual regression coverage for the responsive inbox at
  mobile, tablet, and wide desktop widths.
- Smoke-test the SPA from an actual iPad via `http://toto.local:3000` after
  launching with `bin/dev`.
- Tighten mobile header and toolbar density after screenshot review.
- Decide whether reply creation and reblog controls belong in the SPA preview
  pane or should remain external-client workflows.

## Assumptions

- Rails continues to own authentication, indexing, persistence, and Hive/HAF
  compatibility.
- The first SPA implementation targets the post curation inbox, not every
  secondary admin page.
- Existing Haml/Bootstrap pages remain available until the SPA is proven stable.
- React + Vite + Tailwind is the default frontend stack for new SPA work.
- Local frontend development uses Node 24 from `.nvmrc`; older Node versions
  are expected to fail the Yarn engine check.
