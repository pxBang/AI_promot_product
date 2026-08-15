# STRIKEFORCE — Three.js FPS

A first-person shooter built entirely with **Three.js** and vanilla JavaScript. No build step, no external assets — every weapon model, sound effect, and particle is generated procedurally at runtime.

## Run it

ES modules + import maps require serving over HTTP (opening `index.html` via `file://` will be blocked by browser CORS rules). From this directory:

```bash
# any of these work
python3 -m http.server 8000
# or
npx serve .
# or
node -e "require('http').createServer((q,s)=>require('fs').readFile('.'+decodeURIComponent(q.url.split('?')[0]), (e,d)=>{ if(e){s.writeHead(404);s.end();} else {const t=q.url.endsWith('.html')?'text/html':q.url.endsWith('.css')?'text/css':'text/javascript'; s.writeHead(200,{'Content-Type':t}); s.end(d);}})).listen(8000,()=>console.log('http://localhost:8000'))"
```

Then open **http://localhost:8000** and click **DEPLOY**.

## Controls

| Input | Action |
|-------|--------|
| Mouse | Aim |
| LMB | Fire / melee swing |
| RMB | Aim down sights |
| W A S D | Move |
| Shift | Sprint |
| Ctrl / C | Crouch |
| Space | Jump |
| R | Reload |
| 1–4 / scroll | Switch weapon |
| G | Throw grenade |
| Tab | Scoreboard |
| Esc | Pause |

## Features

- **7 procedural weapons** — pistol, SMG, rifle, shotgun, sniper, RPG (projectile) and knife, each with a hand-built 3D model, recoil, reload & sway animation, ADS, and distinct handling.
- **Precise hit detection** — per-hitbox raycasting (head / torso / limbs) with headshot multipliers, damage falloff and splash damage for explosives.
- **4 themed levels** — Warehouse, Desert Outpost, Arctic Base, Urban Rooftops, procedurally furnished with colliders, cover, lighting and fog.
- **3 modes** — Team Deathmatch, Domination (capture points) and Free-For-All, played against AI bots with teammates.
- **AI enemies** — A* pathfinding on a navigation grid, patrol / chase / attack / strafe states, line-of-sight checks, burst fire and team targeting.
- **Particles** — pooled muzzle flashes, tracers, impact sparks, blood, smoke, debris and explosions.
- **Inventory** — weapon slots, ammo management and pickups (health, armor, ammo, weapons) with respawn.
- **Procedural audio** — Web Audio–synthesised gunshots, footsteps, reloads, hit markers, explosions and ambient loops.
- **Scoring & stats** — kills, deaths, assists, headshots, accuracy, damage, kill streaks, multikills, captures and a live scoreboard.
- **Replay** — kill cam (replays your killer's last moments) and a match-highlights feed on the end screen.

## Project layout

```
index.html        UI shell (HUD, menus) + three.js import map
css/style.css     HUD & menu styling
js/main.js        renderer, match flow, combat resolution, objectives
js/player.js      first-person controller, physics, inventory
js/weapons.js     procedural models, viewmodel animation, firing
js/ai.js          A* nav grid + enemy combat AI
js/levels.js      themed level builder
js/particles.js   pooled particle effects
js/audio.js       Web Audio sound synthesis
js/pickups.js     health/armor/ammo/weapon pickups
js/hud.js         DOM HUD, minimap, kill feed, scoreboard
js/score.js       scoring & statistics
js/replay.js      kill cam & highlights
js/config.js      weapons, levels, settings, constants
js/input.js       keyboard / mouse / pointer-lock
```
