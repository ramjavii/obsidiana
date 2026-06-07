# Plan: Graph view improvements

## Goal

Make the graph view nicer, faster, and always show the full connection
graph (not filtered sub-graphs).

## Changes

### 1. One main graph (remove N-hop filter)

**Problem:** Currently when a note is selected (`activePath` is set),
`computeNhopNeighborhood` filters the graph to 2 hops around that note.
The user sees a different sub-graph per note instead of one stable view.

**Fix:** Always pass `query.data` (the full graph) to `ForceGraph2D`.
Remove the `filtered` useMemo — the graph always shows every node and
every link. The `activePath` note is highlighted visually (color + link
thickness) instead of filtering.

**File:** `src/components/GraphView.tsx`
- Delete `computeNhopNeighborhood` function (no longer called)
- Delete `filtered` useMemo
- Pass `query.data` directly as `graphData`

### 2. Highlight connections of the active note

**Adding back what N-hop filter did, but visually instead.**

When a note is clicked/active, its direct connections "glow":
- The active node stays emerald (`#10b981`)
- All other nodes are grey (`#52525b`)
- Links connected to the active node get a thicker brighter color (`#a1a1aa`, `linkWidth=2`)
- Unconnected links stay thin and dark (`#3f3f46`, `linkWidth=0.3`)

**Implementation:**
- Add a `highlightSet` — the set of node IDs that are the active
  note + its immediate neighbors (1 hop BFS). This is computed in a
  `useMemo` from `query.data.links` and `activePath`.
- `nodeColor`: if in highlightSet → bright, else → grey
- `linkColor`: if either endpoint is in highlightSet → `#a1a1aa`, else `#3f3f46`
- `linkWidth`: same distinction: 2 vs 0.3

### 3. Thicker connections

**Change:**
- The thick highlighted links: `linkWidth={2}`
- The thin background links: `linkWidth={0.3}`

### 4. Labels below nodes (already correct)

Line 215 uses `+ r + 4/globalScale` (positive Y = below). No change
needed — the fix was already committed. The user may need to restart
the app to see it.

### 5. Faster physics / smoother drag

**Problem:** The d3-force simulation runs too long and drag feels sluggish.

**Fix** — add these props to `ForceGraph2D`:

| Prop | Current | New | Effect |
|------|---------|-----|--------|
| `d3AlphaDecay` | default 0.02 | `0.08` | Simulation settles 4× faster |
| `d3VelocityDecay` | default 0.4 | `0.6` | Nodes stop moving sooner |
| `warmupTicks` | default 0 | `200` | Pre-compute positions before first render |
| `cooldownTicks` | default ∞ | `500` | Stop simulation after 500 ticks |
| `cooldownTime` | default 15000 | `5000` | Max 5 seconds of simulation |

These make the graph:
- Start with pre-computed positions (warmupTicks)
- Stop simulating quickly after layout is stable
- Respond immediately when dragging (because the simulation isn't
  fighting against dragging with too much alpha)

**Also:** Remove `enableNodeDrag` if set (default is true). The current
code doesn't set it, so drag is enabled by default — good.

### Files modified

| File | Change |
|------|--------|
| `src/components/GraphView.tsx` | Remove N-hop filter, add highlight logic, tune physics, thicker links |

### Files deleted

None. `computeNhopNeighborhood` is removed from `GraphView.tsx`.

### Tests

- `src/__tests__/GraphView.test.tsx` — remove tests that check N-hop
  filtering behavior (4 tests: "shows all nodes when no activePath",
  "filters to 2-hop neighborhood", "hides orphan nodes"). Keep tests
  for loading, error, empty, and canvas rendering.
- Update "passes nodeCanvasObjectMode and nodeCanvasObject" test.

### MVP impact

No checkbox changes. These are UX improvements to already-shipped
features (§4.1–4.3).

### Risk areas

- Removing the N-hop filter means the graph will ALWAYS show ALL notes.
  For vaults with 1000+ notes, this could be slow. The faster physics
  settings mitigate this. If perf is still bad, we can add a node count
  cap (e.g. 500 nodes) as a fallback.
- The highlight BFS is 1-hop only. If the user wants more, we can
  add it later.
- Tests for N-hop behavior need careful updating.

### Fallback

If performance is still bad after tuning physics, add `maxNodeCount={500}`
to limit visible nodes (sort by degree, show top 500).
