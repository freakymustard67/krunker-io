# Krunker.io Clone 🔫

A browser-based first-person shooter built with JavaScript, Three.js and Vite.
Inspired by Krunker.io — with **online multiplayer** against a shared
authoritative server, or offline play vs bots.

## Features

- **Multiplayer FFA** (up to 12 players + 8 server bots) over WebSocket
  - Authoritative 60Hz server simulation, client-side prediction with
    reconciliation, 100ms interpolation of remote players
  - Server-side hit detection, damage, scoring, respawns and match timer
- **Offline mode** vs local bots (same shared simulation code)
- **Movement**: slide-hopping, bunny hop, wall-jump, crouch, ADS, jump pads
- **7 classes** with Krunker-faithful stats (Triggerman, Hunter, Run N Gun,
  Spray N Pray, Vince, Detective, Marksman)
- Primary / pistol / knife loadout, reloads, grenades, hit markers,
  damage numbers, kill feed, scoreboard, minimap, sniper scope

## Tech Stack

- **Vite** — build tool
- **Vanilla JavaScript** — no heavy frameworks
- **Three.js** — rendering
- **ws** — WebSocket server
- **shared/** — simulation code shared by client and server

## Getting Started

```bash
npm install
npm run server   # terminal 1: authoritative game server (port 3001)
npm run dev      # terminal 2: Vite dev server
```

Open the URL shown by Vite, enter a name, and hit **PLAY ONLINE**.
To play against the server from another machine:

```
https://<your-app>/?server=wss://<server-host>:3001
```

You can also play offline vs bots without the server running.

## Scripts

| Script            | Purpose                          |
| ----------------- | -------------------------------- |
| `npm run dev`     | Vite dev server                  |
| `npm run build`   | Production build (Vercel-ready)  |
| `npm run server`  | Game server (`PORT` env overrides) |
| `npm run test:server` | Headless integration smoke test |

## Architecture

```
shared/     Pure simulation (physics, combat, bots, grenades, map data) —
            runs in both the browser (prediction) and Node (authority)
server/     WebSocket server: 60Hz tick, input handling, hit detection,
            scoring, 20Hz snapshots, event messages
src/        Client: rendering, HUD, input, prediction + interpolation (net.js)
```
