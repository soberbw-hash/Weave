// Synthetic QA media only; never read or modify user projects.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
const directory = await fs.mkdtemp(path.join(root, "artifacts", "editing-qa-"));
const sampleRate = 8000,
  count = sampleRate,
  wav = Buffer.alloc(44 + count * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++)
  wav.writeInt16LE(
    Math.round(1000 * Math.sin((i / sampleRate) * 440 * Math.PI * 2)),
    44 + i * 2,
  );
await fs.writeFile(path.join(directory, "测试旁白.wav"), wav, { flag: "wx" });
console.log(directory);
if(process.argv.includes("--stack-variants")) {
  const source=await fs.readFile(path.join(root,"artifacts","验收视频.mp4"));
  for(const label of ["A","B"]){const text=Buffer.from(`Weave synthetic QA ${label}`),box=Buffer.alloc(8+text.length);box.writeUInt32BE(box.length,0);box.write("free",4);text.copy(box,8);await fs.writeFile(path.join(directory,`测试镜头-候选${label}.mp4`),Buffer.concat([source,box]),{flag:"wx"});}
  await fs.copyFile(path.join(root,"public","assets","ai-pack.png"),path.join(directory,"测试源图.png"));
}
