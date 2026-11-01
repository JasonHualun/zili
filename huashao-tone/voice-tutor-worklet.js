// 麦克风采集：AudioContext 已设为 16 kHz，这里把浮点采样转成 16 位 PCM，每 100 ms（1600 个采样）交出一块。
class Pcm16Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Int16Array(1600);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      const value = Math.max(-1, Math.min(1, sample));
      this.chunk[this.filled++] = value < 0 ? value * 0x8000 : value * 0x7fff;
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(1600);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm16-capture", Pcm16Capture);
