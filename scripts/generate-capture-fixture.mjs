// Generate a synthetic modulated tone for local UI acceptance, not user media.
import { mkdir, writeFile } from "node:fs/promises";
const rate = 16000,
  seconds = 4,
  frames = rate * seconds;
const bytes = Buffer.alloc(44 + frames * 2);
bytes.write("RIFF", 0);
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++) {
  const t = i / rate,
    envelope =
      (0.12 + 0.7 * Math.pow(Math.sin(t * 3.7), 2)) *
      Math.min(1, t * 10, (seconds - t) * 10);
  bytes.writeInt16LE(
    Math.round(Math.sin(2 * Math.PI * 220 * t) * envelope * 26000),
    44 + i * 2,
  );
}
const folder = new URL("../artifacts/capture-audio-20261016/", import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL("旁白验收.wav", folder), bytes, { flag: "wx" });
console.log("Created synthetic WAV fixture");
