import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type DrawFrame = (context: CanvasRenderingContext2D, width: number, height: number) => void;

export function Artwork({ draw, className }: { draw: DrawFrame; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef(draw);
  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const { width, height } = element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.max(1, Math.round(width * scale));
    const pixelsHigh = Math.max(1, Math.round(height * scale));
    if (element.width !== pixelsWide) element.width = pixelsWide;
    if (element.height !== pixelsHigh) element.height = pixelsHigh;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    renderer.current(context, width, height);
  }, []);

  useLayoutEffect(() => {
    renderer.current = draw;
    paint();
  }, [draw, paint]);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [paint]);

  return <canvas ref={canvas} className={className} aria-hidden="true" />;
}

