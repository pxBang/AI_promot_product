// input.js — keyboard + mouse + pointer-lock management

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame (edge)
    this.released = new Set();  // keys released this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = { left: false, right: false };
    this.mouseClicked = { left: false, right: false };
    this.mouseWheel = 0;
    this.locked = false;
    this._onLockChange = [];

    this._keydown = (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._keyup = (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    };
    this._mousemove = (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    this._mousedown = (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseDown.left = true; this.mouseClicked.left = true; }
      if (e.button === 2) { this.mouseDown.right = true; this.mouseClicked.right = true; }
    };
    this._mouseup = (e) => {
      if (e.button === 0) this.mouseDown.left = false;
      if (e.button === 2) this.mouseDown.right = false;
    };
    this._contextmenu = (e) => e.preventDefault();
    this._wheel = (e) => { if (this.locked) this.mouseWheel += Math.sign(e.deltaY); };
    this._lockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      this._onLockChange.forEach((cb) => cb(this.locked));
    };
  }

  attach() {
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    document.addEventListener('mousemove', this._mousemove);
    document.addEventListener('mousedown', this._mousedown);
    document.addEventListener('mouseup', this._mouseup);
    document.addEventListener('contextmenu', this._contextmenu);
    document.addEventListener('wheel', this._wheel);
    document.addEventListener('pointerlockchange', this._lockChange);
  }

  detach() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    document.removeEventListener('mousemove', this._mousemove);
    document.removeEventListener('mousedown', this._mousedown);
    document.removeEventListener('mouseup', this._mouseup);
    document.removeEventListener('contextmenu', this._contextmenu);
    document.removeEventListener('wheel', this._wheel);
    document.removeEventListener('pointerlockchange', this._lockChange);
  }

  onLockChange(cb) { this._onLockChange.push(cb); }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  unlock() { if (this.locked) { try { document.exitPointerLock(); } catch (e) {} } }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }

  // call at end of each frame
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseClicked.left = false;
    this.mouseClicked.right = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseWheel = 0;
  }
}
