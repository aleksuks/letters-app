import { useAudioPlayer } from "expo-audio";
import type { AudioSource } from "expo-audio";
import { useRef } from "react";

/**
 * Plays a short local sound effect on demand. `seekTo(0)` before each play
 * so rapid repeat triggers (e.g. two letters received back to back) restart
 * from the top instead of being silently dropped while the previous
 * playback is still finishing.
 */
export function useSound(source: AudioSource) {
  const player = useAudioPlayer(source);

  return function play() {
    player.seekTo(0);
    player.play();
  };
}

/**
 * A sound effect whose progress tracks a drag gesture rather than playing
 * start to finish — e.g. a tear that only advances while a flap is
 * actively being peeled further, and holds still (or resets) the moment
 * that stops.
 *
 * expo-audio has no sample-accurate scrubbing API, and two attempts at
 * repeatedly re-seeking it during the drag (continuous seek-while-playing,
 * then seek-and-burst on a timer) both only ever produced one audible
 * blip before going silent — real seek latency can't keep up with being
 * re-targeted dozens of times a second, and calls made faster than the
 * native layer can land seem to just get dropped. So instead of seeking
 * at all mid-drag, the clip is simply left playing continuously once
 * forward movement starts, and paused the instant the drag stalls or
 * reverses — `play`/`pause` are cheap, idempotent state toggles every
 * platform handles reliably, unlike repeated seeks.
 */
export function useScrubSound(source: AudioSource) {
  const player = useAudioPlayer(source);
  const started = useRef(false);

  function advance() {
    if (!player.isLoaded) return;
    if (!started.current) {
      started.current = true;
      player.seekTo(0);
    }
    player.play();
  }

  function hold() {
    player.pause();
  }

  function reset() {
    started.current = false;
    player.pause();
    player.seekTo(0);
  }

  function play() {
    reset();
    player.play();
  }

  // How much longer the clip has left from wherever it currently sits —
  // lets a caller that's about to tear down the player (e.g. on unmount)
  // wait exactly long enough for it to finish instead of cutting it off.
  function remainingMs() {
    if (!player.isLoaded || player.duration <= 0) return 0;
    return Math.max(0, (player.duration - player.currentTime) * 1000);
  }

  return { advance, hold, reset, play, remainingMs };
}
