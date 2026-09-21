// mulberry32: シード付き乱数。?seed= で再現できるようにする
export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.s = this.seed || 0x9e3779b9;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // [min, max] の整数
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  float(min, max) { return min + this.next() * (max - min); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // 重み付き抽選: [{w, ...}]
  weighted(arr, key = 'w') {
    const total = arr.reduce((s, a) => s + a[key], 0);
    let r = this.next() * total;
    for (const a of arr) { r -= a[key]; if (r < 0) return a; }
    return arr[arr.length - 1];
  }
}
