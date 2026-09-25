# Oak Core — Oak Joinery home app + shared login

**Live:** https://seanoakjoinery.github.io/oak-core/

This repo is the ONE shortcut the team uses. Log in once (pick your name, enter your PIN) and you get a button for each app you're allowed to use:

- Dispatch — https://seanoakjoinery.github.io/Dispatch-App/
- Stock List — https://seanoakjoinery.github.io/Oak-Stock-List/
- Board Stock — https://seanoakjoinery.github.io/Board-Stock-Take/
- Consumables — https://seanoakjoinery.github.io/Consumables-Stock-Take/

The four apps stay separate (own repos, own data). They share the login through `oak-core.js`:

| File | Purpose |
|------|---------|
| `index.html` | The home app (login + app buttons) |
| `oak-core.js` | Shared library every app loads: Firebase config, PIN hash, merge-safe user saves (v2), one-login session (v3) |
| `manifest.json`, `sw.js`, `icon-*.png` | Makes the home app installable ("Add to Home Screen") |
| `demo/` | Old sandbox link — now forwards to the home app |

## How the one login works (v3)

- The home app saves who is logged in on this device (`localStorage.oakSession`: user id + PIN hash + expiry, 12 hours).
- Each app reads it on start. No session → it sends you to the home app, then straight back after login. No access → back home with a message.
- **☰ Menu** in each app goes back home (still logged in). **Log out** is on the home screen.
- Changing a PIN or deleting a user ends their session everywhere. Dispatch / Stock List still log out after 20 minutes idle.
- Troubleshooting: add `?local=1` to an app's URL to use that app's own login screen.

Apps load `https://seanoakjoinery.github.io/oak-core/oak-core.js?v=3` — bump the `?v=` in all four apps whenever this file changes (their service workers cache it).
