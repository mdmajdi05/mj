'use client';

export function ButterflyLayer({
  ids,
  onOpen,
  onDismiss
}: {
  ids: string[];
  onOpen: () => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-live="polite">
      {ids.map((id, index) => (
        <button
          key={id}
          className="butterfly-flight pointer-events-auto"
          style={{
            top: `${12 + ((index * 17) % 66)}%`,
            animationDelay: `${(index % 3) * 0.35}s`
          }}
          onClick={() => {
            onDismiss(id);
            onOpen();
          }}
          aria-label="A new private message arrived. Open Chat."
          title="New message"
        >
          <svg
            viewBox="0 0 64 56"
            className="butterfly-svg"
            role="img"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`wing-a-${index}`} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="55%" stopColor="#e879f9" />
                <stop offset="100%" stopColor="#60a5fa" />
              </linearGradient>
              <linearGradient id={`wing-b-${index}`} x1="1" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <g className="butterfly-left">
              <path
                d="M30 27C18 8 4 5 3 16c-1 10 9 17 24 18-12 5-17 14-9 18 7 4 14-5 14-12Z"
                fill={`url(#wing-a-${index})`}
                opacity=".9"
              />
              <path
                d="M30 31c-9 4-13 12-8 15 5 4 10-3 10-9Z"
                fill={`url(#wing-b-${index})`}
                opacity=".75"
              />
            </g>
            <g className="butterfly-right">
              <path
                d="M34 27C46 8 60 5 61 16c1 10-9 17-24 18 12 5 17 14 9 18-7 4-14-5-14-12Z"
                fill={`url(#wing-b-${index})`}
                opacity=".9"
              />
              <path
                d="M34 31c9 4 13 12 8 15-5 4-10-3-10-9Z"
                fill={`url(#wing-a-${index})`}
                opacity=".75"
              />
            </g>
            <ellipse cx="32" cy="29" rx="2.4" ry="10" fill="#f5d0fe" />
            <circle cx="32" cy="18" r="2.2" fill="#fdf4ff" />
          </svg>
        </button>
      ))}
    </div>
  );
}
