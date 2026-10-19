export const MAX_WAVEFORM_BYTES = 8 * 1024 * 1024;
export type AudioWaveformData = { peaks: number[]; duration: number };

/** Bounded PCM WAV sampling, without a decoder, AudioContext or audio playback. */
export function pcmWaveform(bytes: ArrayBuffer): AudioWaveformData | undefined {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_WAVEFORM_BYTES) return;
  const data = new DataView(bytes);
  const tag = (offset: number) =>
    String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return;
  let format = 0,
    channels = 0,
    rate = 0,
    block = 0,
    bits = 0,
    start = 0,
    length = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const size = data.getUint32(offset + 4, true),
      body = offset + 8;
    if (body + size > bytes.byteLength) return;
    if (tag(offset) === "fmt " && size >= 16) {
      format = data.getUint16(body, true);
      channels = data.getUint16(body + 2, true);
      rate = data.getUint32(body + 4, true);
      block = data.getUint16(body + 12, true);
      bits = data.getUint16(body + 14, true);
    }
    if (tag(offset) === "data") {
      start = body;
      length = size;
    }
    offset = body + size + (size % 2);
  }
  if (
    !start ||
    !rate ||
    channels < 1 ||
    channels > 8 ||
    !(
      (format === 1 && [8, 16, 24, 32].includes(bits)) ||
      (format === 3 && bits === 32)
    ) ||
    block !== (channels * bits) / 8 ||
    length % block
  )
    return;
  const frames = length / block;
  if (!frames) return;
  const peaks = Array.from({ length: 48 }, (_, index) => {
    const from = Math.floor((index * frames) / 48),
      to = Math.floor(((index + 1) * frames) / 48);
    const step = Math.max(1, Math.ceil((to - from) / 256));
    let peak = 0;
    for (let frame = from; frame < to; frame += step) {
      for (let channel = 0; channel < channels; channel++) {
        const at = start + frame * block + (channel * bits) / 8;
        let sample = 0;
        if (format === 3) sample = data.getFloat32(at, true);
        else if (bits === 8) sample = (data.getUint8(at) - 128) / 128;
        else if (bits === 16) sample = data.getInt16(at, true) / 32768;
        else if (bits === 24)
          sample =
            (data.getUint8(at) |
              (data.getUint8(at + 1) << 8) |
              (data.getInt8(at + 2) << 16)) /
            8388608;
        else sample = data.getInt32(at, true) / 2147483648;
        if (Number.isFinite(sample))
          peak = Math.max(peak, Math.min(1, Math.abs(sample)));
      }
    }
    return peak;
  });
  return { peaks, duration: frames / rate };
}

export function audioDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds || seconds < 0) return "音频";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
