// score.js — scoring, statistics tracking, kill feed, match results

import { SCORE } from './config.js';

export class ScoreTracker {
  constructor() {
    this.teamScore = { blue: 0, red: 0 };
    this.stats = new Map(); // name -> stats
    this.killFeed = [];
    this.highlights = [];
    this.firstBlood = false;
    this.playerName = 'You';
    this.playerTeam = 'blue';
    this.mode = 'tdm';
    this.matchTime = 0;
    this.objectiveStatus = []; // for domination: per objective {team, progress}
    this.lastKillTimes = []; // for multikill detection
  }

  _get(name) {
    if (!this.stats.has(name)) {
      this.stats.set(name, {
        name, team: name === this.playerName ? this.playerTeam : (this._botTeam(name)),
        kills: 0, deaths: 0, assists: 0, headshots: 0,
        shotsFired: 0, shotsHit: 0, damage: 0, score: 0,
        streak: 0, bestStreak: 0, captures: 0, multikills: 0,
      });
    }
    return this.stats.get(name);
  }

  _botTeam(name) { return null; } // set by caller via setBotTeam

  setBotTeam(name, team) { const s = this._get(name); s.team = team; }
  setPlayer(team) { this.playerTeam = team; const s = this._get(this.playerName); s.team = team; }

  recordShot(hit) {
    const s = this._get(this.playerName);
    s.shotsFired++;
    if (hit) s.shotsHit++;
  }

  recordDamage(name, amount) {
    const s = this._get(name);
    s.damage += Math.round(amount);
  }

  recordKill(killerName, victimName, headshot, weaponId, killerTeam) {
    if (!this.firstBlood) {
      this.firstBlood = true;
      if (killerName) {
        const ks = this._get(killerName);
        ks.score += SCORE.firstBlood;
        this.addHighlight(`${killerName} — FIRST BLOOD`, 'FIRST BLOOD');
      }
    }
    const v = this._get(victimName);
    v.deaths++;
    v.streak = 0;

    if (killerName && killerName !== victimName) {
      const k = this._get(killerName);
      k.kills++;
      k.streak++;
      k.bestStreak = Math.max(k.bestStreak, k.streak);
      k.score += SCORE.kill;
      if (headshot) { k.headshots++; k.score += SCORE.headshot; }

      // multikill detection (3+ kills within 4s)
      const now = performance.now();
      this.lastKillTimes.push(now);
      this.lastKillTimes = this.lastKillTimes.filter((t) => now - t < 4000);
      if (this.lastKillTimes.length >= 3) {
        k.multikills++;
        k.score += 50;
        this.addHighlight(`${killerName} — MULTIKILL`, 'MULTIKILL');
        this.lastKillTimes = [];
      }

      // team score
      if (killerTeam) {
        this.teamScore[killerTeam] += this.mode === 'ffa' ? 0 : 1;
      } else if (k.team && k.team !== 'none') {
        this.teamScore[k.team] += this.mode === 'ffa' ? 0 : 1;
      }
      if (this.mode === 'ffa') k.score += 25; // ffa kill worth more personal score

      // streak bonus
      if (k.streak > 0 && k.streak % 3 === 0) {
        k.score += SCORE.streakBonus;
        this.addHighlight(`${killerName} — ${k.streak} KILL STREAK`, 'STREAK');
      }
    }

    // feed
    this.addFeed(killerName, victimName, headshot, weaponId, killerTeam);
    return killerName === this.playerName;
  }

  recordAssist(name) {
    const s = this._get(name);
    s.assists++;
    s.score += SCORE.assist;
  }

  recordCapture(team, name) {
    this.teamScore[team] += SCORE.capture;
    const s = this._get(name);
    s.captures++;
    s.score += SCORE.capture;
  }

  recordCaptureTick(team) {
    this.teamScore[team] += SCORE.captureTick / 10;
  }

  onPickup(type) {
    const s = this._get(this.playerName);
    if (type.startsWith('weapon')) s.score += 5;
  }

  addFeed(killer, victim, headshot, weaponId, killerTeam) {
    const wName = weaponId ? weaponId : 'melee';
    this.killFeed.push({ killer, victim, headshot, weapon: wName, killerTeam, t: performance.now() });
    if (this.killFeed.length > 6) this.killFeed.shift();
  }

  addHighlight(text, badge) {
    this.highlights.push({ text, badge });
  }

  getPlayerStats() { return this._get(this.playerName); }

  getScoreboard() {
    const list = [...this.stats.values()];
    list.sort((a, b) => b.score - a.score);
    return list;
  }

  get accuracy() {
    const s = this._get(this.playerName);
    return s.shotsFired > 0 ? (s.shotsHit / s.shotsFired) * 100 : 0;
  }
}
