/** XMB category glyphs. Drawn rather than shipped so no Sony artwork is bundled. */
const P: Record<string, string> = {
  settings:
    'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM12 2l1.5 2.6 3-.4.6 3 2.6 1.5-1.4 2.7 1.4 2.7-2.6 1.5-.6 3-3-.4L12 22l-1.5-2.6-3 .4-.6-3L4.3 15.3l1.4-2.7-1.4-2.7 2.6-1.5.6-3 3 .4z',
  search: 'M10.5 3a7.5 7.5 0 105.2 12.9L21 21M10.5 3a7.5 7.5 0 000 15 7.5 7.5 0 000-15z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5.2l3.4 2',
  film: 'M3 5h18v14H3zM3 9h18M3 15h18M7.5 5v14M16.5 5v14',
  tv: 'M3 7h18v11H3zM8 3l4 4 4-4',
  star: 'M12 3.2l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.6l6-.8z',
  tag: 'M3 3h8l10 10-8 8L3 11zM7.2 7.2h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8.5 3v4M15.5 3v4',
  person: 'M12 3a4 4 0 100 8 4 4 0 000-8zM4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5',
  import: 'M12 3v11M7.5 10L12 14.5 16.5 10M4 20h16',
  download: 'M12 3v11M7.5 10L12 14.5 16.5 10M4 17v3h16v-3',
  video: 'M3 6h12v12H3zM15 10l6-3.5v11L15 14',
  music: 'M9 18V5l10-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm10-2a3 3 0 11-6 0 3 3 0 016 0z',
  wave: 'M2 12c3-6 5 6 8 0s5 6 8 0M2 17c3-6 5 6 8 0s5 6 8 0M2 7c3-6 5 6 8 0s5 6 8 0',
  display: 'M3 5h18v12H3zM8 21h8M12 17v4',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5h.01',
  reset: 'M20 12a8 8 0 11-2.6-5.9M20 3v5h-5',
  folder: 'M3 6h6l2 2h10v11H3z',
  play: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10 8.4l5.5 3.6L10 15.6z',
  heart: 'M12 20.5S3.5 15.3 3.5 9.4A4.4 4.4 0 0112 7a4.4 4.4 0 018.5 2.4c0 5.9-8.5 11.1-8.5 11.1z',
  check: 'M4 12.6 9.2 18 20 6.5',
}

export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  const d = P[name] ?? P.folder
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
