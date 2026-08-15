# Apex Velocity — 3D Racing Game

A complete 3D racing game built with **Three.js** and vanilla JavaScript. Everything
is self-contained in this folder (Three.js is vendored locally, no CDN or `npm install`
needed).

## Run it

```bash
node server.js
```

Then open **http://localhost:3000** in a modern browser.

> ES modules require HTTP — opening `index.html` directly via `file://` will not work.

## Controls

| Action | Player 1 | Player 2 |
|---|---|---|
| Throttle / Brake | `W` / `S` | `↑` / `↓` |
| Steer | `A` / `D` | `←` / `→` |
| Handbrake | `Space` | `/` |
| Nitro | `Left Shift` | `Enter` |
| Cycle camera | `C` | — |
| Reset to track | `R` | — |
| Back to menu | `Esc` | `Esc` |

Gamepads are also supported (stick to steer, triggers to accelerate/brake).

## Features

- **Realistic vehicle physics** — raycast suspension (springs + dampers), slip-based
  tire friction with a friction circle, weight transfer, aerodynamics (drag +
  downforce), a 6-speed automatic gearbox, and handbrake drifting.
- **Detailed car models** — procedurally built body, cabin, spoiler, wheels and lights.
- **Customization & upgrades** — paint colour (body/accent swatches + hue sliders) and
  Engine / Tires / Aero / Brakes / Nitro upgrades bought with race credits. Stored in
  `localStorage`.
- **Four tracks** with varying terrain, banking, elevation, curbs, cones, rocks,
  ramps and boost pads.
- **AI opponents** — racing-line following with corner curvature speed control,
  collision avoidance, overtaking and rubber-banding across 4 difficulty levels.
- **Split-screen multiplayer** — two players on one keyboard.
- **HUD** — speed, gear, lap times, best lap, position, live position ticker and a
  minimap.
- **Particles** — tire smoke, exhaust, nitro flame, sparks, dust, rain and snow.
- **Dynamic day/night cycle** with realistic sun, sky, fog and headlights, plus
  clear / rain / snow / fog weather (rain and snow reduce grip).
- **Race modes** — Quick Race, Time Trial (with best-lap ghost), Championship
  (4-round points series) and Elimination (last place knocked out).
- **Replay system** — every race is recorded; watch it back with Chase / Hood /
  Orbit / Cinematic / TV camera angles, play/pause and scrubbing.
- **Audio** — synthesized engine, skid, collision and boost sounds via Web Audio.

## Project structure

```
index.html        Shell + menus + HUD markup
css/style.css     All styling
server.js         Zero-dependency static server
js/
  main.js         Bootstrap, menu flow, garage, results, replay UI
  game.js         Game loop, race modes, cameras, collisions, minimap data
  physics.js      Vehicle physics (suspension, tires, aero, drivetrain)
  track.js        Track generation, terrain, obstacles, surface sampling
  car.js          Procedural car model + paint
  ai.js           AI opponents with difficulty levels
  input.js        Keyboard + gamepad input (2 players)
  hud.js          HUD rendering (speed, laps, minimap, ticker)
  particles.js    GPU particle system (smoke, sparks, dust, nitro)
  weather.js      Day/night cycle, lighting, rain/snow/fog
  replay.js       Race recorder + playback with interpolation
  audio.js        Web Audio engine/skid/SFX
  config.js       Tuning constants, upgrades, difficulty
  utils.js        Math + storage helpers
  three.module.js Vendored Three.js (r160)
```
