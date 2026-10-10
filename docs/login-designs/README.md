# Login design studies

Five visual directions for the next Hyperion login screen: Edition, Orbit,
Workbench, Commonroom, and Signal. Each keeps the four branded wallet buttons.
These are visual previews; submitting a form only displays a preview notice.

To serve through the local Rails app:

```sh
ln -s ../docs/login-designs public/login-designs
```

Open `http://localhost:3000/login-designs/index.html`. The public symlink is a
local preview convenience, not part of the production login flow. The files can
also be served with any static HTTP server from this directory.

The appearance menu defaults to **System**, using
`matchMedia('(prefers-color-scheme: dark)')` before the stylesheet loads and
listening for subsequent system changes. Light and Dark are temporary preview
overrides. Layout and override choices are reflected in the URL, so a particular
design can be shared. No preference or account data is stored.

The shared form uses visible wallet labels, decorative images, unique input
labels, and local assets. The Hyperion mark and Work Sans font are copied from
the app; wallet artwork sources are listed in [wallets.md](../wallets.md).

Verification: all five designs checked in light and dark; no horizontal page,
heading, input, or button overflow at 320, 390, 768, 1024, and 1440 pixels.
System preference detection, simulated live preference changes, and manual
overrides passed in the browser. Wallet actions remain inert in this gallery.
Primary text and wallet-label contrast is at least 5.88:1 in light mode and
8.83:1 in dark mode. Mobile text spacing and unique form labels were also checked.
