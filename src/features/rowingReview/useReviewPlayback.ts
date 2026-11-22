import { useCallback, useEffect, useState } from 'react';
import type { Chapter } from './reviewPresentation';

interface Playback {
  index: number;
  elapsed: number;
  playing: boolean;
}

export function useReviewPlayback(chapters: readonly Chapter[]) {
  const fromHash = useCallback(() => Math.max(0, chapters.findIndex(chapter => chapter.id === location.hash.slice(1))), [chapters]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playback, setPlayback] = useState<Playback>(() => {
    const index = fromHash();
    return { index, elapsed: reducedMotion ? chapters[index].duration : 0, playing: !reducedMotion };
  });

  const select = useCallback((index: number, animate: boolean) => {
    const playing = animate && !reducedMotion;
    setPlayback({ index, elapsed: playing ? 0 : chapters[index].duration, playing });
  }, [chapters, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    function onMotionChange(event: MediaQueryListEvent) {
      setReducedMotion(event.matches);
      if (event.matches) {
        setPlayback(state => ({ ...state, elapsed: chapters[state.index].duration, playing: false }));
      }
    }
    media.addEventListener('change', onMotionChange);
    return () => media.removeEventListener('change', onMotionChange);
  }, [chapters]);

  useEffect(() => {
    const onHashChange = () => select(fromHash(), true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [fromHash, select]);

  useEffect(() => {
    if (!playback.playing) return;
    let previous: number | null = null;
    let frame = 0;
    function tick(now: number) {
      const delta = previous === null || document.hidden ? 0 : Math.min(100, now - previous);
      previous = now;
      if (delta > 0) {
        setPlayback(state => {
          if (!state.playing) return state;
          const elapsed = state.elapsed + delta;
          const duration = chapters[state.index].duration;
          if (elapsed < duration) return { ...state, elapsed };
          if (state.index < chapters.length - 1) return { index: state.index + 1, elapsed: 0, playing: true };
          return { ...state, elapsed: duration, playing: false };
        });
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chapters, playback.playing]);

  const chapter = chapters[playback.index];

  const jump = useCallback((index: number, animate = playback.playing) => {
    if (index >= 0 && index < chapters.length) select(index, animate);
  }, [chapters.length, playback.playing, select]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = playback.index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (target >= 0 && target < chapters.length) {
        event.preventDefault();
        jump(target);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapters.length, jump, playback.index]);

  return { ...playback, chapter, jump };
}
