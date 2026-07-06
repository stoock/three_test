/** 큰 수를 한국어 단위(만/억/조)로 축약 */
export function formatNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e16) return `${(n / 1e12).toPrecision(3)}조`;
  if (abs >= 1e12) return `${trim(n / 1e12)}조`;
  if (abs >= 1e8) return `${trim(n / 1e8)}억`;
  if (abs >= 1e4) return `${trim(n / 1e4)}만`;
  return Math.floor(n).toLocaleString('ko-KR');
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toLocaleString('ko-KR');
}

export function formatYear(y: number): string {
  return `${formatNum(Math.floor(y))}년`;
}
