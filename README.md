# Multi-Minesweeper

Minesweeper, but each cell can hold up to 6 mines. Numbers go up to 48. Good luck.

Play it at [napero.github.io/multiminesweeper](https://napero.github.io/multiminesweeper).

<!-- screenshots go here -->

## How it works

Classic minesweeper rules apply, left-click to open, right-click to flag, middle-click to chord. The twist is that cells can stack multiple mines, so flags cycle from 1 to 6 and the hint numbers reflect the *total* mine count across all neighbours.

Five presets (Beginner, Intermediate, Hard, Expert, Nightmare) and a fully custom mode with configurable density, which controls how much mines clump together vs spread out.

## Controls

- **Left-click**: open a cell. If it's already open, chord (open neighbours if flags match the number).
- **Right-click**: cycle the flag on a closed cell: 1 -> 2 -> ... -> 6 -> clear.
- **Middle-click**: chord directly.

## Toolbar

- **Settings**: dropdown with Beginner / Intermediate / Expert presets, or Custom for full control over rows, cols, mine count, max per cell, density, and seed.
- **Help**: links to the GitHub repo.
- **Smiley**: click to start a new game.
- **Timer**: starts on your first click.
- **Hint**: toggles hint mode. While active, hovering the board shows a dark overlay on the 3×3 area that will be revealed. Click to reveal it, mines get flagged, safe cells get opened.
- **Give Up**: reveals the entire board.

## Tech

- **TypeScript** + **Vite**: zero-framework static site, canvas 2D rendering
- **Engine/UI split**: game logic is pure functions with no DOM dependency, tested with Vitest
- **Spritesheet rendering** with canvas fallback if the image fails to load
- **Seeded PRNG** (Mulberry32): same seed = same board, every time
- **Pixel-scaled sprites**: 16×16 tiles integer-scaled to fill the viewport, Win95 aesthetic with the [Pixelated MS Sans Serif](https://fontstruct.com/fontstructions/show/1384746) font

```bash
npm install
npm run dev       # dev server
npm run build     # static build to /dist
npm test          # engine tests
```

## License

MIT
