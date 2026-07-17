export function buildTrendPolyline(
  values: number[],
  width = 600,
  height = 220,
  padding = 20,
) {
  if (values.length === 0) return "";
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return values.map((value, index) => {
    const x = values.length === 1
      ? padding + innerWidth / 2
      : padding + (index / (values.length - 1)) * innerWidth;
    const y = range === 0
      ? padding + innerHeight / 2
      : padding + innerHeight - ((value - min) / range) * innerHeight;
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
  }).join(" ");
}
