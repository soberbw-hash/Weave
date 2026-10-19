import { useEffect, useRef, useState } from "react";
import { Waveform } from "@phosphor-icons/react";
import type { Asset } from "../types";
import { useAudioDragPreparation } from "./useAudioDragPreparation";
import {
  audioDuration,
  MAX_WAVEFORM_BYTES,
  pcmWaveform,
  type AudioWaveformData,
} from "../services/audioWaveform";

const cache = new Map<string, AudioWaveformData>();
export function AudioThumbnail({ asset }: { asset: Asset }) {
  const host = useAudioDragPreparation(asset);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wave, setWave] = useState<AudioWaveformData>();
  useEffect(() => {
    setWave(undefined);
    const key = `${asset.hash}:${asset.size}`;
    if (
      !asset.url ||
      asset.size > MAX_WAVEFORM_BYTES ||
      !/\.wav$/i.test(asset.name)
    )
      return;
    const saved = cache.get(key);
    if (saved) {
      setWave(saved);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(asset.url!, { signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        if (blob.size !== asset.size || blob.size > MAX_WAVEFORM_BYTES) return;
        const result = pcmWaveform(await blob.arrayBuffer());
        if (!result || controller.signal.aborted) return;
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        setWave(result);
      } catch {
        /* Unsupported/unavailable originals keep the illustrative icon. */
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    });
    if (host.current) observer.observe(host.current);
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [asset.url, asset.hash, asset.size, asset.name]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !wave) return;
    context.clearRect(0, 0, 288, 64);
    context.fillStyle = "#a66e35";
    wave.peaks.forEach((peak, index) => {
      const height = Math.max(2, peak * 58);
      context.fillRect(index * 6 + 1, (64 - height) / 2, 3, height);
    });
  }, [wave]);
  return (
    <div
      className="audio-thumbnail"
      ref={host}
      title={wave ? "原音频采样波形" : "音频示意，非真实波形"}
    >
      {wave ? (
        <canvas
          ref={canvas}
          width={288}
          height={64}
          role="img"
          aria-label="原音频采样波形"
        />
      ) : (
        <Waveform size={144} weight="light" aria-label="音频示意，非真实波形" />
      )}
      <span className="audio-thumbnail-meta">
        <span>{asset.name.split(".").pop()?.toUpperCase()}</span>
        <span>{audioDuration(wave?.duration ?? asset.duration)}</span>
      </span>
    </div>
  );
}
