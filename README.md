# Oak Core (sandbox)

**Option A — shared core sandbox** for Oak Joinery.

This repo holds a small shared auth library (`oak-core.js`) and a **read-only** demo page so Sean can try shared login **without touching** the four live apps:

- Dispatch-App  
- Oak-Stock-List  
- Board-Stock-Take  
- Consumables-Stock-Take  

Those live repos are **not** modified by anything in here.

## What is in this folder

| File | Purpose |
|------|---------|
| `oak-core.js` | Shared auth helpers (`window.OakCore`) — Firebase config, PIN hash, users sync, login |
| `oak-theme.css` | Dark oak theme matching the live apps |
| `demo/index.html` | Standalone sandbox PWA page (no service worker) |
| `.gitignore` | Ignores `.DS_Store`, `node_modules`, `.env` |

## Open the demo (GitHub Pages)

Once this repo is on GitHub as `SeanOakJoinery/oak-core` and Pages is enabled (root `/`, or deploy the whole repo):

**https://seanoakjoinery.github.io/oak-core/demo/**

Relative paths from the demo page load:

- `../oak-core.js` → `/oak-core/oak-core.js`
- `../oak-theme.css` → `/oak-core/oak-theme.css`

## How to test

1. Open the demo URL (or open `demo/index.html` via a local static server — `file://` may block Firebase).
2. Wait for the shared user list to load from Firebase (`dispatchBoard/users`).
3. Pick a person who has **Board Stock** access.
4. Enter their **real Board Stock PIN**.
5. You should see a success screen with username, root flags, apps ticks, and `OakCore.VERSION`.

**Nothing is saved.** The sandbox is `readOnly: true`. Login only checks the PIN hash in memory. There is no create / edit / delete user UI, and `saveUsers()` throws *"Sandbox is read-only"*.

## Next steps (later)

When you are happy with the sandbox:

1. Point the real apps at this `oak-core.js` (script tag from Pages, or copy into each app).
2. Keep writes merge-safe — live apps today `.set()` the whole users array; core v1 keeps that only when `readOnly` is false. Safer per-user writes come later.
3. Only then retire the duplicated auth blocks inside each live `index.html`.

## Local files only

This folder is ready to push to a **new** repo. Do not push into the four live app repos.
