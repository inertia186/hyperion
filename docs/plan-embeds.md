# Embed Support Plan

Condenser handles app embeds through `src/app/components/elements/EmbeddedPlayers`
and expands provider tokens generated during HTML preparation. Hyperion currently
vendors the Hive content renderer and has local 3Speak support; the providers
below are candidates for future parity work.

## Condenser Providers

Plain URL auto-embed support appears to exist for:

- Archive.org
- DTube
- Instagram
- Mixcloud
- Reddit
- Spotify
- 3Speak
- TikTok
- TravelFeed / Truvvl
- Twitch
- Twitter / X
- Vimeo
- YouTube

Iframe or embed-code validation support appears to exist for:

- Bandcamp
- Dapplr
- SoundCloud

## Notes

- Condenser converts recognized URLs or embed HTML into `~~~ embed:id provider ~~~`
  tokens, then expands those tokens into provider-specific iframe or blockquote
  markup.
- Some providers support both plain URL conversion and iframe URL validation.
  The lists above group them by the most useful future implementation path for
  Hyperion.
- 3Speak is already implemented locally in the vendored renderer; future work
  should follow that pattern where it makes sense, while keeping provider names
  Hive-specific and avoiding legacy Steem naming.
