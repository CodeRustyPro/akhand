'use client';

import { motion } from 'framer-motion';
import type { CityDnaAxis } from '@/lib/cityDna';

interface RadarChartProps {
  axes: CityDnaAxis[];
  size?: number;
}

export default function RadarChart({ axes, size = 240 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 36; // leave room for labels
  const rings = [0.25, 0.5, 0.75, 1.0];
  const n = axes.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // top

  function polarToXY(angle: number, r: number): [number, number] {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  // Concentric grid rings
  const gridRings = rings.map((scale) => {
    const points = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep;
      return polarToXY(angle, radius * scale);
    });
    return points.map(([x, y]) => `${x},${y}`).join(' ');
  });

  // Axis lines
  const axisLines = Array.from({ length: n }, (_, i) => {
    const angle = startAngle + i * angleStep;
    return polarToXY(angle, radius);
  });

  // Data polygon
  const dataPoints = axes.map((axis, i) => {
    const angle = startAngle + i * angleStep;
    const r = Math.max(0.08, axis.value) * radius; // min 8% so shape is visible
    return polarToXY(angle, r);
  });
  const dataPolygon = dataPoints.map(([x, y]) => `${x},${y}`).join(' ');

  // Labels
  const labels = axes.map((axis, i) => {
    const angle = startAngle + i * angleStep;
    const labelR = radius + 18;
    const [x, y] = polarToXY(angle, labelR);
    let anchor: 'middle' | 'start' | 'end' = 'middle';
    if (Math.cos(angle) > 0.3) anchor = 'start';
    else if (Math.cos(angle) < -0.3) anchor = 'end';
    return { x, y, text: axis.label, anchor };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto"
    >
      {/* Grid rings */}
      {gridRings.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="rgba(196,154,108,0.1)"
          strokeWidth={i === rings.length - 1 ? 0.8 : 0.5}
        />
      ))}

      {/* Axis lines */}
      {axisLines.map(([x, y], i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="rgba(196,154,108,0.08)"
          strokeWidth={0.5}
        />
      ))}

      {/* Data fill */}
      <motion.polygon
        points={dataPolygon}
        fill="rgba(196,154,108,0.15)"
        stroke="rgba(196,154,108,0.7)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={2.5}
          fill="#c49a6c"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 + i * 0.05 }}
        />
      ))}

      {/* Labels */}
      {labels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          dominantBaseline="central"
          className="fill-akhand-text-muted"
          style={{ fontSize: '9px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}
