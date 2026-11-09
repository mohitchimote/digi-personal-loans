// Orthogonal "circuit diagram" routing for the workflow canvas. Pure functions, no Angular.
//
// The conventions are the ones an electrical schematic uses:
//  * Wires are horizontal/vertical only and never pass through a component (status box).
//  * Two different wires never share a corridor: every transition has its own vertical slot and its
//    own horizontal track. Sources of ONE transition (Cancel from six statuses) are one net: they join
//    a shared bar and each join is marked with a solid DOT.
//  * Where two different wires cross WITHOUT connecting, the horizontal one hops over the vertical one.
//    So "dot = connected, hop = just crossing" is never ambiguous.
//  * Placement is searched, not accidental: row order inside lanes, wire order inside corridors and the
//    track each transition uses are optimised to minimise crossings, bends and length.

export const NODE_W = 156;
export const NODE_H = 46;
export const GUTTER = 66;                  // half-width of the free corridor between two lanes
export const LANE_W = NODE_W + 2 * GUTTER;
export const TOP = 64;                     // space for lane headings
const MIN_GAP = 40;                        // minimum vertical space between rows
const TRACK_PITCH = 13;                    // spacing between parallel horizontal tracks
const PORT_PITCH = 9;
const RADIUS = 7;
const HOP = 5;                             // hop radius
const RESTARTS = 14;                       // extra seeded starts for the layout search

export interface RouterStatus { key: string; lane: number; row: number }
export interface RouterTransition { key: string; label: string; actors: string[]; from: string[]; to: string }

export interface PlacedNode { key: string; x: number; y: number; h: number; lane: number; row: number }
export interface RoutedEdge {
  key: string;            // the transition key
  from: string; to: string;
  path: string;
  label?: { x: number; y: number; w: number; text: string; full: string; floating?: boolean };
}
export interface RoutedDot { x: number; y: number; key: string }
export interface RouterResult { nodes: PlacedNode[]; edges: RoutedEdge[]; dots: RoutedDot[]; width: number; height: number; crossings: number }

type Pt = { x: number; y: number };
type Seg = { tk: string; x1: number; y1: number; x2: number; y2: number; h: boolean };

const LABEL_MAX = 18;
export function shortLabel(text: string): string { return text.length > LABEL_MAX ? text.slice(0, LABEL_MAX - 1) + '…' : text; }
export function labelWidth(text: string): number { return Math.round(text.length * 6.1 + 16); }

type Kind = 'self' | 'direct' | 'same' | 'track' | 'vert';
interface E { t: RouterTransition; s: RouterStatus; b: RouterStatus; kind: Kind }

/** The things the optimiser moves around. */
interface Cfg {
  row: Map<string, number>;            // status -> row inside its lane
  gutter: Map<number, string[]>;       // gutter index -> transition keys, in left-to-right slot order
  track: Map<number, string[]>;        // row-gap index -> transition keys, in top-to-bottom track order
  gapOf: Map<string, number>;
}

interface Geometry { nodes: PlacedNode[]; polys: { e: E; pts: Pt[] }[]; width: number; height: number }

// One cached optimisation: typing a label must not re-run the search, only a structural change does.
let cache: { sig: string; cfg: Cfg } | null = null;

export function route(statuses: RouterStatus[], transitions: RouterTransition[], laneCount: number): RouterResult {
  const lanes = Math.max(1, laneCount);
  const st = new Map(statuses.map(s => [s.key, s]));
  const rows = Math.max(1, ...statuses.map(s => s.row + 1));

  // ---- which arrows exist (wildcard sources are not drawn; the UI lists them separately)
  const edges: E[] = [];
  for (const t of transitions) {
    const b = st.get(t.to);
    if (!b) continue;
    for (const f of t.from) {
      const s = st.get(f);
      if (!s) continue;
      const kind: Kind = s.key === b.key ? 'self' : s.lane === b.lane ? 'same' : b.lane === s.lane + 1 ? 'direct' : 'track';
      edges.push({ t, s, b, kind });
    }
  }

  // ---- static facts: which corridors each transition uses, which transitions need a horizontal track
  const gutterMembers = new Map<number, string[]>();
  const useGutter = (g: number, tk: string) => {
    const l = gutterMembers.get(g) ?? [];
    if (!l.includes(tk)) l.push(tk);
    gutterMembers.set(g, l);
  };
  const trackEdges = new Map<string, E[]>();
  for (const e of edges) {
    if (e.kind === 'self') continue;
    if (e.kind === 'same' || e.kind === 'direct') useGutter(e.s.lane + 1, e.t.key);
    else { useGutter(e.s.lane + 1, e.t.key); useGutter(e.b.lane, e.t.key); trackEdges.set(e.t.key, [...(trackEdges.get(e.t.key) ?? []), e]); }
  }

  // ---- search for a good arrangement (cached by structure)
  const sig = JSON.stringify([lanes, statuses.map(s => [s.key, s.lane, s.row]), transitions.map(t => [t.key, t.from, t.to])]);
  let cfg: Cfg;
  if (cache && cache.sig === sig) cfg = cache.cfg;
  else {
    // Hill-climbing from one start gets stuck; restart from seeded shuffles and keep the best. Deterministic.
    cfg = initial(statuses, gutterMembers, trackEdges, rows);
    let best = optimise(cfg, edges, rows, lanes, statuses, trackEdges);
    for (let seed = 1; seed <= RESTARTS && best > 0; seed++) {
      const alt = shuffled(initial(statuses, gutterMembers, trackEdges, rows), seed, statuses);
      const c = optimise(alt, edges, rows, lanes, statuses, trackEdges);
      if (c < best - 1e-9) { best = c; cfg = alt; }
    }
    cache = { sig, cfg };
  }

  const geo = build(cfg, edges, rows, lanes, statuses);
  const segs = segmentsOf(geo);

  // ---- hops: horizontal wires jump over vertical wires of OTHER transitions
  const hopsFor = (tk: string, a: Pt, b: Pt): number[] => {
    if (a.y !== b.y) return [];
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    const xs: number[] = [];
    for (const v of segs) {
      if (v.h || v.tk === tk) continue;
      if (v.x1 > lo + RADIUS + HOP + 2 && v.x1 < hi - RADIUS - HOP - 2 && a.y > v.y1 + 1 && a.y < v.y2 - 1) xs.push(v.x1);
    }
    xs.sort((p, q) => p - q);
    // never two hops closer than a hop's width
    return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 2 * HOP + 3);
  };

  const out: RoutedEdge[] = [];
  const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
  const nodeBoxes = geo.nodes.map(n => ({ x: n.x - 2, y: n.y - 2, w: NODE_W + 4, h: n.h + 4 }));
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const labelled = new Set<string>();

  const placeLabel = (tk: string, text: string, pts: Pt[]): RoutedEdge['label'] | undefined => {
    if (labelled.has(tk)) return undefined;
    const full = text; text = shortLabel(text);
    const w = labelWidth(text), h = 16;
    const cands: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 20) continue;
      const horizontal = a.y === b.y;
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) cands.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (horizontal) cands.unshift({ x: (a.x + b.x) / 2, y: a.y });
    }
    for (const c of cands) {
      const box = { x: c.x - w / 2, y: c.y - h / 2, w, h };
      if (labelBoxes.some(l => overlaps(box, l)) || nodeBoxes.some(n => overlaps(box, n))) continue;
      labelBoxes.push(box); labelled.add(tk);
      return { x: c.x, y: c.y, w, text, full };
    }
    const c = cands[0] ?? pts[0];
    labelled.add(tk);
    return { x: c.x, y: c.y, w, text, full, floating: true };
  };

  // Longest runs first so long transitions get the good label spots.
  const order = [...geo.polys].sort((a, b) => Math.abs(b.e.s.lane - b.e.b.lane) - Math.abs(a.e.s.lane - a.e.b.lane));
  const drawn = new Map<E, RoutedEdge>();
  for (const { e, pts } of order) {
    const re: RoutedEdge = { key: e.t.key, from: e.s.key, to: e.b.key, path: pathOf(pts, e.t.key, hopsFor) };
    re.label = placeLabel(e.t.key, e.t.label, pts);
    drawn.set(e, re);
  }
  for (const e of edges) out.push(drawn.get(e)!);

  return { nodes: geo.nodes, edges: out, dots: junctions(geo), width: geo.width, height: geo.height, crossings: countCrossings(segs) };
}

// =====================================================================================================
// Initial arrangement
// =====================================================================================================
function initial(statuses: RouterStatus[], gutterMembers: Map<number, string[]>, trackEdges: Map<string, E[]>, rows: number): Cfg {
  const row = new Map(statuses.map(s => [s.key, s.row]));
  const gutter = new Map<number, string[]>([...gutterMembers].map(([g, l]) => [g, [...l]]));
  const track = new Map<number, string[]>();
  const gapOf = new Map<string, number>();
  for (const [tk, es] of trackEdges) {
    const g = candidateGaps(es, rows, row)[0];
    gapOf.set(tk, g);
    track.set(g, [...(track.get(g) ?? []), tk]);
  }
  return { row, gutter, track, gapOf };
}

/** Gaps a transition's horizontal track may sit in: around the rows of its sources and target. */
function candidateGaps(es: E[], rows: number, row: Map<string, number>): number[] {
  const rs = [...es.map(e => row.get(e.s.key)!), row.get(es[0].b.key)!];
  const lo = Math.min(...rs), hi = Math.max(...rs);
  const out: number[] = [];
  for (let g = lo; g <= Math.min(rows, hi + 1); g++) out.push(g);
  return out;
}

// =====================================================================================================
// Geometry for a given arrangement
// =====================================================================================================
function build(cfg: Cfg, edges: E[], rows: number, lanes: number, statuses: RouterStatus[]): Geometry {
  // Statuses stacked directly on top of each other in one lane connect with a straight wire between
  // their facing sides instead of detouring through a side corridor.
  const kindOf = (e: E): Kind => (e.kind === 'same' && Math.abs(cfg.row.get(e.s.key)! - cfg.row.get(e.b.key)!) === 1 ? 'vert' : e.kind);
  const kinds = new Map<E, Kind>(edges.map(e => [e, kindOf(e)]));

  // pins per box side. A busy status gets a taller body so its wires are never squeezed together.
  const pinIds = new Map<string, Set<string>>();
  const addPin = (node: string, side: 'L' | 'R', id: string) => { const k = `${node}|${side}`; (pinIds.get(k) ?? pinIds.set(k, new Set()).get(k)!).add(id); };
  for (const e of edges) {
    const k = kinds.get(e)!;
    if (k === 'self' || k === 'vert') continue;
    addPin(e.s.key, 'R', `${e.t.key}|out|${e.s.key}`);
    addPin(e.b.key, k === 'same' ? 'R' : 'L', `${e.t.key}|in`);
  }
  const heightOf = new Map<string, number>(statuses.map(s => {
    const n = Math.max(pinIds.get(`${s.key}|L`)?.size ?? 0, pinIds.get(`${s.key}|R`)?.size ?? 0);
    return [s.key, Math.max(NODE_H, 22 + Math.max(0, n - 1) * PORT_PITCH)];
  }));
  const rowH: number[] = new Array(rows).fill(NODE_H);
  for (const s of statuses) { const r = cfg.row.get(s.key)!; rowH[r] = Math.max(rowH[r], heightOf.get(s.key)!); }

  const gapCount = (g: number) => cfg.track.get(g)?.length ?? 0;
  const gapH: number[] = [];
  for (let g = 0; g <= rows; g++) gapH.push(Math.max(MIN_GAP, (gapCount(g) + 1) * TRACK_PITCH + 12));
  const rowY: number[] = [];
  let y = TOP + gapH[0];
  for (let r = 0; r < rows; r++) { rowY.push(y); y += rowH[r] + gapH[r + 1]; }
  const height = y + 8;
  const gapTop = (g: number) => (g === 0 ? TOP : rowY[g - 1] + rowH[g - 1]);
  const trackY = (tk: string) => {
    const g = cfg.gapOf.get(tk)!;
    const list = cfg.track.get(g)!;
    return gapTop(g) + ((list.indexOf(tk) + 1) * gapH[g]) / (list.length + 1);
  };

  const nodes: PlacedNode[] = statuses.map(s => {
    const r = cfg.row.get(s.key)!, h = heightOf.get(s.key)!;
    return { key: s.key, lane: s.lane, row: r, h, x: s.lane * LANE_W + GUTTER, y: rowY[r] + (rowH[r] - h) / 2 };
  });
  const pos = new Map(nodes.map(n => [n.key, n]));

  const used = new Map<number, Set<string>>();
  const markUsed = (g: number, tk: string) => { (used.get(g) ?? used.set(g, new Set()).get(g)!).add(tk); };
  const vertTk = new Map<number, string[]>();
  for (const e of edges) {
    const k = kinds.get(e)!;
    if (k === 'vert') { const l = vertTk.get(e.s.lane) ?? []; if (!l.includes(e.t.key)) l.push(e.t.key); vertTk.set(e.s.lane, l); }
    else if (k === 'same' || k === 'direct') markUsed(e.s.lane + 1, e.t.key);
    else if (k === 'track') { markUsed(e.s.lane + 1, e.t.key); markUsed(e.b.lane, e.t.key); }
  }
  const slotX = (g: number, tk: string): number => {
    const l = cfg.gutter.get(g)!.filter(x => used.get(g)?.has(x));
    return g * LANE_W - GUTTER + ((l.indexOf(tk) + 1) * 2 * GUTTER) / (l.length + 1);
  };
  const vertX = (lane: number, tk: string): number => {
    const l = vertTk.get(lane)!;
    return lane * LANE_W + GUTTER + ((l.indexOf(tk) + 1) * NODE_W) / (l.length + 1);
  };

  // pins ordered by where the wire goes, so wires leave in the order they fan out
  const portReqs = new Map<string, { id: string; far: number }[]>();
  const addPort = (node: string, side: 'L' | 'R', id: string, far: number) => {
    const k = `${node}|${side}`;
    const l = portReqs.get(k) ?? [];
    if (!l.some(p => p.id === id)) l.push({ id, far });
    portReqs.set(k, l);
  };
  for (const e of edges) {
    const k = kinds.get(e)!;
    if (k === 'self' || k === 'vert') continue;
    const sn = pos.get(e.s.key)!, bn = pos.get(e.b.key)!;
    addPort(e.s.key, 'R', `${e.t.key}|out|${e.s.key}`, bn.y + bn.h / 2);
    addPort(e.b.key, k === 'same' ? 'R' : 'L', `${e.t.key}|in`, sn.y + sn.h / 2);
  }
  const portY = new Map<string, number>();
  for (const [k, reqs] of portReqs) {
    const node = pos.get(k.split('|')[0])!;
    const sorted = [...reqs].sort((a, b) => a.far - b.far);
    sorted.forEach((p, i) => portY.set(`${k}|${p.id}`, node.y + node.h / 2 + (i - (sorted.length - 1) / 2) * PORT_PITCH));
  }
  const port = (node: string, side: 'L' | 'R', id: string) => portY.get(`${node}|${side}|${id}`)!;

  const polys: { e: E; pts: Pt[] }[] = [];
  for (const e of edges) {
    const tk = e.t.key;
    const sN = pos.get(e.s.key)!, bN = pos.get(e.b.key)!;
    let pts: Pt[];
    const kind = kinds.get(e)!;
    if (kind === 'vert') {
      const x = vertX(e.s.lane, tk);
      pts = sN.y < bN.y ? [{ x, y: sN.y + sN.h }, { x, y: bN.y }] : [{ x, y: sN.y }, { x, y: bN.y + bN.h }];
    } else if (kind === 'self') {
      const x0 = sN.x + NODE_W * 0.3, x1 = sN.x + NODE_W * 0.7, y0 = sN.y, up = 24;
      pts = [{ x: x0, y: y0 }, { x: x0, y: y0 - up }, { x: x1, y: y0 - up }, { x: x1, y: y0 }];
    } else {
      const sy = port(e.s.key, 'R', `${tk}|out|${e.s.key}`);
      const sx = sN.x + NODE_W;
      if (kind === 'same') {
        const by = port(e.b.key, 'R', `${tk}|in`), gx = slotX(e.s.lane + 1, tk);
        pts = [{ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: by }, { x: bN.x + NODE_W, y: by }];
      } else if (kind === 'direct') {
        const by = port(e.b.key, 'L', `${tk}|in`), gx = slotX(e.s.lane + 1, tk);
        pts = [{ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: by }, { x: bN.x, y: by }];
      } else {
        const by = port(e.b.key, 'L', `${tk}|in`);
        const g1 = slotX(e.s.lane + 1, tk), g2 = slotX(e.b.lane, tk), ty = trackY(tk);
        pts = [{ x: sx, y: sy }, { x: g1, y: sy }, { x: g1, y: ty }, { x: g2, y: ty }, { x: g2, y: by }, { x: bN.x, y: by }];
      }
    }
    polys.push({ e, pts: pts.filter((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y) });
  }
  return { nodes, polys, width: lanes * LANE_W, height };
}

function segmentsOf(geo: Geometry): Seg[] {
  const out: Seg[] = [];
  for (const { e, pts } of geo.polys) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.x === b.x && a.y === b.y) continue;
      out.push({ tk: e.t.key, x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y), h: a.y === b.y });
    }
  }
  return out;
}

function countCrossings(segs: Seg[]): number {
  let n = 0;
  for (const a of segs) {
    if (!a.h) continue;
    for (const v of segs) {
      if (v.h || v.tk === a.tk) continue;
      if (v.x1 > a.x1 + 0.5 && v.x1 < a.x2 - 0.5 && a.y1 > v.y1 + 0.5 && a.y1 < v.y2 - 0.5) n++;
    }
  }
  return n;
}

// =====================================================================================================
// Optimiser: hill-climbing over row order, corridor order, track order and track gap
// =====================================================================================================
function cost(cfg: Cfg, edges: E[], rows: number, lanes: number, statuses: RouterStatus[]): number {
  const geo = build(cfg, edges, rows, lanes, statuses);
  const segs = segmentsOf(geo);
  const crossings = countCrossings(segs);
  let overlap = 0, length = 0, bends = 0, hits = 0;
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i];
    length += (a.x2 - a.x1) + (a.y2 - a.y1);
    for (let j = i + 1; j < segs.length; j++) {
      const b = segs[j];
      if (b.tk === a.tk || a.h !== b.h) continue;
      if (a.h && a.y1 === b.y1 && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 1) overlap++;
      if (!a.h && a.x1 === b.x1 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 1) overlap++;
    }
    for (const n of geo.nodes) {
      if (a.x2 > n.x + 1 && a.x1 < n.x + NODE_W - 1 && a.y2 > n.y + 1 && a.y1 < n.y + n.h - 1) hits++;
    }
  }
  for (const p of geo.polys) bends += Math.max(0, p.pts.length - 2);
  return crossings * 10 + overlap * 20 + hits * 100 + length * 0.01 + bends * 0.4 + geo.height * 0.004;
}

function optimise(cfg: Cfg, edges: E[], rows: number, lanes: number, statuses: RouterStatus[], trackEdges: Map<string, E[]>): number {
  let best = cost(cfg, edges, rows, lanes, statuses);
  const byLane = new Map<number, string[]>();
  for (const s of statuses) byLane.set(s.lane, [...(byLane.get(s.lane) ?? []), s.key]);

  const attempt = (apply: () => void, undo: () => void): boolean => {
    apply();
    const c = cost(cfg, edges, rows, lanes, statuses);
    if (c < best - 1e-9) { best = c; return true; }
    undo();
    return false;
  };

  for (let pass = 0; pass < 8; pass++) {
    let improved = false;

    // 1. exchange two statuses of the same lane
    for (const keys of byLane.values()) {
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const swap = () => { const a = cfg.row.get(keys[i])!, b = cfg.row.get(keys[j])!; cfg.row.set(keys[i], b); cfg.row.set(keys[j], a); };
        if (attempt(swap, swap)) improved = true;
      }
    }
    // 2. exchange two wires in a corridor
    for (const list of cfg.gutter.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const swap = () => { [list[i], list[j]] = [list[j], list[i]]; };
        if (attempt(swap, swap)) improved = true;
      }
    }
    // 3. exchange two tracks in a row gap
    for (const list of cfg.track.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const swap = () => { [list[i], list[j]] = [list[j], list[i]]; };
        if (attempt(swap, swap)) improved = true;
      }
    }
    // 4. move a transition's track to another gap
    for (const [tk, es] of trackEdges) {
      for (const g of candidateGaps(es, rows, cfg.row)) {
        const from = cfg.gapOf.get(tk)!;
        if (g === from) continue;
        const idx = cfg.track.get(from)!.indexOf(tk);
        const apply = () => {
          cfg.track.get(from)!.splice(cfg.track.get(from)!.indexOf(tk), 1);
          cfg.track.set(g, [...(cfg.track.get(g) ?? []), tk]);
          cfg.gapOf.set(tk, g);
        };
        const undo = () => {
          cfg.track.get(g)!.splice(cfg.track.get(g)!.indexOf(tk), 1);
          cfg.track.get(from)!.splice(idx, 0, tk);
          cfg.gapOf.set(tk, from);
        };
        if (attempt(apply, undo)) improved = true;
      }
    }
    if (!improved) break;
  }
  return best;
}

/** A deterministic random arrangement: shuffles row order inside lanes and wire order inside corridors. */
function shuffled(cfg: Cfg, seed: number, statuses: RouterStatus[]): Cfg {
  let a = seed * 2654435761 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = <T,>(l: T[]) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } };
  const byLane = new Map<number, string[]>();
  for (const s of statuses) byLane.set(s.lane, [...(byLane.get(s.lane) ?? []), s.key]);
  for (const keys of byLane.values()) { const rows = keys.map(k => cfg.row.get(k)!); shuffle(rows); keys.forEach((k, i) => cfg.row.set(k, rows[i])); }
  for (const l of cfg.gutter.values()) shuffle(l);
  for (const l of cfg.track.values()) shuffle(l);
  return cfg;
}

// =====================================================================================================
// Drawing: rounded corners, hops, junction dots
// =====================================================================================================
function pathOf(pts: Pt[], tk: string, hopsFor: (tk: string, a: Pt, b: Pt) => number[]): string {
  const p = pts;
  if (p.length < 2) return '';
  const trim = (i: number): number => {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    return Math.min(RADIUS, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
  };
  const toward = (from: Pt, to: Pt, d: number): Pt => {
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / l) * d, y: from.y + ((to.y - from.y) / l) * d };
  };
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    const start = i === 0 ? a : toward(a, b, trim(i));
    const end = i === p.length - 2 ? b : toward(b, a, trim(i + 1));
    if (a.y === b.y) {
      const dir = b.x > a.x ? 1 : -1;
      const xs = hopsFor(tk, start, end);
      for (const x of dir === 1 ? xs : [...xs].reverse()) {
        d += ` L ${x - dir * HOP} ${a.y} A ${HOP} ${HOP} 0 0 ${dir === 1 ? 1 : 0} ${x + dir * HOP} ${a.y}`;
      }
    }
    d += ` L ${end.x} ${end.y}`;
    if (i < p.length - 2) {
      const next = toward(b, p[i + 2], trim(i + 1));
      d += ` Q ${b.x} ${b.y} ${next.x} ${next.y}`;
    }
  }
  return d;
}

/** Solid dots where several wires of ONE transition meet: the circuit-diagram "these are connected". */
function junctions(geo: Geometry): RoutedDot[] {
  const byTk = new Map<string, Pt[][]>();
  for (const { e, pts } of geo.polys) byTk.set(e.t.key, [...(byTk.get(e.t.key) ?? []), pts]);
  const dots: RoutedDot[] = [];
  const k = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  for (const [tk, polys] of byTk) {
    if (polys.length < 2) continue;
    const verts: Pt[] = polys.flat();
    // unit segments: every polyline segment split at any vertex that lies on it
    const unit = new Set<string>();
    for (const pts of polys) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const on = verts.filter(v => (a.x === b.x ? v.x === a.x && v.y > Math.min(a.y, b.y) && v.y < Math.max(a.y, b.y) : v.y === a.y && v.x > Math.min(a.x, b.x) && v.x < Math.max(a.x, b.x)));
        const chain = [a, ...on.sort((p, q) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) - Math.abs(q.x - a.x) - Math.abs(q.y - a.y)), b];
        for (let c = 0; c < chain.length - 1; c++) {
          const [p, q] = [chain[c], chain[c + 1]];
          if (p.x === q.x && p.y === q.y) continue;
          const [first, second] = k(p.x, p.y) < k(q.x, q.y) ? [p, q] : [q, p];
          unit.add(`${k(first.x, first.y)}|${k(second.x, second.y)}`);
        }
      }
    }
    const degree = new Map<string, { n: number; x: number; y: number }>();
    for (const u of unit) {
      for (const end of u.split('|')) {
        const [x, y] = end.split(',').map(Number);
        const cur = degree.get(end) ?? { n: 0, x: x / 100, y: y / 100 };
        cur.n++; degree.set(end, cur);
      }
    }
    for (const d of degree.values()) if (d.n >= 3) dots.push({ x: d.x, y: d.y, key: tk });
  }
  return dots;
}
