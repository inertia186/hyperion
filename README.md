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

This repo includes Heroku process definitions for the Rails web process,
the optional indexing worker, and release-phase database migrations.

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

Scale the indexer only when you want Heroku to run the background import loop:

```
heroku ps:scale worker=1
```

Post indexing uses the public HafSQL connection by default. Set
`HAFSQL_DATABASE_URL` or the individual `HAFSQL_*` config vars above if the
production app should use a different HafSQL endpoint.
