export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number
  private spare: number | null = null

  constructor(seed?: number) {
    const words = seed === undefined ? crypto.getRandomValues(new Uint32Array(4)) : Rng.expandSeed(seed)
    this.a = words[0] | 0
    this.b = words[1] | 0
    this.c = words[2] | 0
    this.d = words[3] | 0
    for (let i = 0; i < 15; i++) this.nextUint()
  }

  private static expandSeed(seed: number): Uint32Array {
    const words = new Uint32Array(4)
    let state = seed >>> 0
    for (let i = 0; i < 4; i++) {
      state = (state + 0x6d2b79f5) >>> 0
      let t = Math.imul(state ^ (state >>> 15), state | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      words[i] = (t ^ (t >>> 14)) >>> 0
    }
    return words
  }

  nextUint(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  next(): number {
    return this.nextUint() / 4294967296
  }

  gaussian(): number {
    if (this.spare !== null) {
      const value = this.spare
      this.spare = null
      return value
    }
    const u1 = Math.max(this.next(), Number.EPSILON)
    const u2 = this.next()
    const radius = Math.sqrt(-2 * Math.log(u1))
    const angle = 2 * Math.PI * u2
    this.spare = radius * Math.sin(angle)
    return radius * Math.cos(angle)
  }

  fork(): Rng {
    return new Rng(this.nextUint())
  }
}
