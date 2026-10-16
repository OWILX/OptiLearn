import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: string;
  className?: string;
}

function toCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export function Skeleton({
  height = 120,
  width = '100%',
  radius,
  className,
}: SkeletonProps) {
  const style: CSSProperties = {
    height: toCss(height),
    width: toCss(width),
  };
  if (radius) style.borderRadius = radius;

  return (
    <div
      className={`${styles.skeleton} ${className ?? ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}
