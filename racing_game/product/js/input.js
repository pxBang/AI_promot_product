import { KEY } from './config.js';

// Keyboard + gamepad input manager. Supports two local players.
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this._onDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    this._onUp = (e) => this.down.delete(e.code);
    this._onBlur = () => { this.down.clear(); this.pressed.clear(); };
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  endFrame() { this.pressed.clear(); }

  // Returns vehicle input for local player 0 (WASD) or 1 (arrows).
  getVehicleInput(player = 0) {
    const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };

    // Gamepad override when available.
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    const pad = pads && pads[player];
    if (pad && pad.connected) {
      const axisX = pad.axes[0] || 0;
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      input.steer = Math.abs(axisX) > 0.08 ? axisX : 0;
      input.throttle = Math.max(rt, pad.buttons[0] && pad.buttons[0].pressed ? 1 : 0);
      input.brake = Math.max(lt, pad.buttons[1] && pad.buttons[1].pressed ? 1 : 0);
      input.handbrake = !!(pad.buttons[2] && pad.buttons[2].pressed);
      input.nitro = !!(pad.buttons[3] && pad.buttons[3].pressed);
      return input;
    }

    if (player === 0) {
      if (this.isDown(KEY.up)) input.throttle = 1;
      if (this.isDown(KEY.down)) input.brake = 1;
      if (this.isDown(KEY.left)) input.steer -= 1;
      if (this.isDown(KEY.right)) input.steer += 1;
      input.handbrake = this.isDown(KEY.handbrake);
      input.nitro = this.isDown(KEY.nitro);
    } else {
      if (this.isDown(KEY.up2)) input.throttle = 1;
      if (this.isDown(KEY.down2)) input.brake = 1;
      if (this.isDown(KEY.left2)) input.steer -= 1;
      if (this.isDown(KEY.right2)) input.steer += 1;
      input.handbrake = this.isDown(KEY.handbrake2);
      input.nitro = this.isDown(KEY.nitro2);
    }
    input.steer = Math.max(-1, Math.min(1, input.steer));
    return input;
  }

  cameraPressed() { return this.wasPressed(KEY.camera); }
  resetPressed() { return this.wasPressed(KEY.reset); }
  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
