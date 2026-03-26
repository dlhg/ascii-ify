// ─── Shared Particle System for Examples ──────────────────────

export class ParticlePool {
  constructor({ maxParticles = 2000, gravity = 0, drag = 1 } = {}) {
    this.particles = [];
    this.maxParticles = maxParticles;
    this.gravity = gravity;
    this.drag = drag;
  }

  get length() {
    return this.particles.length;
  }

  emit(count, spawner) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const p = spawner(i, count);
      if (p) this.particles.push(p);
    }
  }

  update(dt, onDeath) {
    const arr = this.particles;
    let len = arr.length;

    for (let i = len - 1; i >= 0; i--) {
      const p = arr[i];

      p.vy += (p.gravity ?? this.gravity) * dt;
      const drag = p.drag ?? this.drag;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.life <= 0) {
        if (onDeath) onDeath(p);
        // Swap-and-pop removal
        arr[i] = arr[len - 1];
        len--;
      }
    }

    arr.length = len;
  }

  forEach(callback) {
    const arr = this.particles;
    for (let i = 0, len = arr.length; i < len; i++) {
      callback(arr[i], i);
    }
  }

  clear() {
    this.particles.length = 0;
  }
}
