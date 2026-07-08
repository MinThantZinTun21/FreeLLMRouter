import { useState, useEffect } from 'react';

interface ModelCountHeaderProps {
  count: number;
  lastUpdated?: string | null;
  label?: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  return 'over a day ago';
}

export function ModelCountHeader({
  count,
  lastUpdated,
  label = 'free models',
}: ModelCountHeaderProps) {
  const [relativeTime, setRelativeTime] = useState<string | null>(
    lastUpdated ? formatRelativeTime(lastUpdated) : null
  );

  useEffect(() => {
    if (!lastUpdated) {
      setRelativeTime(null);
      return;
    }

    setRelativeTime(formatRelativeTime(lastUpdated));

    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastUpdated));
    }, 60000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{count}</span> {label}
        {relativeTime && (
          <span className="hidden sm:inline">
            <span className="mx-1.5">·</span>
            <span className="text-xs">Updated {relativeTime}</span>
          </span>
        )}
      </p>
    </div>
  );
}
