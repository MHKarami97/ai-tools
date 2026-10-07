export class AudioPrep {
  mixToMono(
    left: Float32Array,
    right: Float32Array,
    startSeconds: number,
    endSeconds: number,
    sampleRate: number,
  ): Float32Array {
    const length = Math.min(left.length, right.length);
    const start = Math.max(0, Math.floor(startSeconds * sampleRate));
    const end = Math.min(length, Math.ceil(endSeconds * sampleRate));
    const mono = new Float32Array(Math.max(0, end - start));

    for (let i = 0; i < mono.length; i++) {
      mono[i] = (left[start + i] + right[start + i]) / 2;
    }

    return mono;
  }

  async resample(samples: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
    if (fromRate === toRate) {
      return samples;
    }

    const length = Math.max(1, Math.ceil((samples.length * toRate) / fromRate));
    const context = new OfflineAudioContext(1, length, toRate);
    const buffer = context.createBuffer(1, Math.max(1, samples.length), fromRate);
    buffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();

    const rendered = await context.startRendering();
    return rendered.getChannelData(0).slice();
  }
}

export const audioPrep = new AudioPrep();
