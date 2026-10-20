import * as React from "react";

/*
 * Minimal Code 128 encoder (sets B and C) rendered as SVG — enough for SKUs and numeric barcodes,
 * readable by any USB scanner. Each pattern lists bar/space module widths starting with a bar.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const STOP = "2331112";
const START_B = 104;
const START_C = 105;

/** Code values for `text` (start code first, checksum last, stop excluded). Returns null if unencodable. */
export function code128Values(text: string): number[] | null {
  if (!text) return null;
  let values: number[];
  if (/^\d+$/.test(text) && text.length % 2 === 0 && text.length >= 4) {
    values = [START_C];
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values = [START_B];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 127) return null;
      values.push(code - 32);
    }
  }
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(checksum);
  return values;
}

/** Bars as [x, width] pairs in module units, plus the total width (with 10-module quiet zones). */
function bars(text: string): { rects: [number, number][]; width: number } | null {
  const values = code128Values(text);
  if (!values) return null;
  const widths = values.map((v) => PATTERNS[v]!).join("") + STOP;
  const rects: [number, number][] = [];
  let x = 10;
  for (let i = 0; i < widths.length; i++) {
    const w = Number(widths[i]);
    if (i % 2 === 0) rects.push([x, w]);
    x += w;
  }
  return { rects, width: x + 10 };
}

/** <Barcode value="SKU-123" height={40} /> — scales to its container width. */
export function Barcode({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const b = React.useMemo(() => bars(value), [value]);
  if (!b) return <span className="text-[10px] text-red-600">Unprintable code</span>;
  return (
    <svg
      viewBox={`0 0 ${b.width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height, width: "100%", display: "block" }}
      role="img"
      aria-label={`Barcode ${value}`}
    >
      {b.rects.map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={height} fill="#000" shapeRendering="crispEdges" />
      ))}
    </svg>
  );
}
