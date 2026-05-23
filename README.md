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
