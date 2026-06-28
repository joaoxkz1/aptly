export function Sparkline({
  values,
  max = 7,
  width = 160,
  height = 40,
}: {
  values: number[];
  max?: number;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const pad = 4;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const points = values.map((v, i) => `${pad + i * step},${y(v)}`).join(" ");

  return (
    <svg width={width} height={height} className="text-primary" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {values.map((v, i) => (
        <circle key={i} cx={pad + i * step} cy={y(v)} r="2.5" fill="currentColor" />
      ))}
    </svg>
  );
}
