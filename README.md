# Hyperion

The backend for hyperion.zone.

# Setup

```
git clone TODO
cd hyperion
bundle install
rake db:create
rake db:seed
```

# Post heading links

Rendered headings have generated fragment IDs in API HTML and both preview
renderers. For example, `# Real Heading` becomes `id="real-heading"` and can be
targeted with `[Jump](#real-heading)`. IDs use the rendered heading text and
Kramdown's basic ASCII slug convention; empty slugs use `section`. Repeated or
colliding names receive unique `-1`, `-2`, etc. suffixes within the post.

IDs are generated after sanitization; author-supplied HTML and Markdown IDs
are not preserved. Fragment links scroll within the current preview. A direct
legacy sandbox URL can include a fragment, such as
`/posts/42/content_sandbox#real-heading`. The React preview still requires the
post to be selected; its fragments do not encode a post selection.

# HiveSigner callbacks

Select the `hyperion.zone` app account at https://hivesigner.com/profile and
register these exact Redirect URIs, one per line:

```text
https://hyperion.zone/sessions/authorized
https://www.hyperion.zone/sessions/authorized
https://hyperion.zone/api/v1/agent/auth_challenges/hivesigner_callback
https://www.hyperion.zone/api/v1/agent/auth_challenges/hivesigner_callback
```

Browser sign-in uses `/sessions/authorized`. Agent device-code sign-in uses
the fixed API callback and carries the challenge ID in OAuth `state`, which
HiveSigner returns to Hyperion. Do not include challenge IDs or `scope=login`
in the registered callback. Each callback must match the request's host and
path exactly. After deploying a callback change, start a fresh device challenge.

# HafSQL indexing

Post indexing uses HafSQL by default. It connects to the public HafSQL endpoint
by default:

```
host: hafsql-sql.mahdiyari.info
port: 5432
database: haf_block_log
user: hafsql_public
password: hafsql_public
```

Override the connection with `HAFSQL_DATABASE_URL`, or with `HAFSQL_HOST`,
`HAFSQL_PORT`, `HAFSQL_DATABASE`, `HAFSQL_USERNAME`, and `HAFSQL_PASSWORD`.

The default comments state relation is `hafsql.comments`. Override it with
`HAFSQL_COMMENTS_RELATION` when your HafSQL schema differs. The default column
names expect `author`, `permlink`, `title`, `body`, `parent_author`,
`category`, `json_metadata`, `created`, `last_edited`, and `deleted`;
override them with `HAFSQL_COMMENTS_*_COLUMN` env vars when needed. The public
view does not expose block or transaction IDs, so Hyperion stores `0` and an
empty transaction id unless `HAFSQL_COMMENTS_BLOCK_NUM_COLUMN` and
`HAFSQL_COMMENTS_TRX_ID_COLUMN` are configured.

Set `HAFSQL_INDEXER_ENABLED=false` to fall back to the original RPC stream
indexer.

# Heroku

This repo includes Heroku process definitions for the Rails web process and
release-phase database migrations.

```
heroku create hyperion-zone
heroku buildpacks:set heroku/nodejs
heroku buildpacks:add heroku/ruby --index 2
heroku addons:create heroku-postgresql:essential-0
heroku config:set RAILS_ENV=production RAILS_LOG_TO_STDOUT=enabled RAILS_SERVE_STATIC_FILES=enabled
heroku config:set SECRET_KEY_BASE=$(openssl rand -hex 64)
git push heroku main
```

If you deploy from a branch other than `main`, push it explicitly:

```
git push heroku HEAD:main
```

Use Heroku Scheduler for periodic indexing. Add a Scheduler job that runs every
10 minutes:

```
bundle exec rake index:once
```

Post indexing uses the public HafSQL connection by default. Set
`HAFSQL_DATABASE_URL` or the individual `HAFSQL_*` config vars above if the
production app should use a different HafSQL endpoint.

## Production diagnostics

Check dynos and recent releases:

```
heroku ps -a hyperion-zone
heroku releases -a hyperion-zone -n 5
```

Check the public health endpoint:

```
curl https://hyperion-zone-ddb79736a137.herokuapp.com/.well-known/healthcheck.json
```

Run read-only inbox and reputation diagnostics:

```
heroku run 'bundle exec rake ops:inbox[inertia]' -a hyperion-zone
heroku run 'bundle exec rake ops:reputation[inertia]' -a hyperion-zone
```

Use a narrow error scan when checking Heroku logs:

```
heroku logs -a hyperion-zone -n 1500 | rg -i '(^|[[:space:]])(at=error|level=error|status=5[0-9][0-9]|code=H10|code=H11|FATAL|Unhandled|ActiveRecord::|ActionController::|NoMethodError|NameError|PG::|RuntimeError)'
```

Avoid broad searches such as `error|exception` for routine checks. They can
false-positive on normal SQL text, account names, or blacklist data.
