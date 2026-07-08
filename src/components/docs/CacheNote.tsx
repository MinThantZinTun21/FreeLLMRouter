interface CacheNoteProps {
  maxAge: number; // Seconds
  sdkTtl?: number; // Minutes (optional)
}

export function CacheNote({ maxAge, sdkTtl }: CacheNoteProps) {
  return (
    <p className="text-xs text-muted-foreground">
      <code className="bg-muted px-1 py-0.5 rounded">Cache-Control: private, max-age={maxAge}</code>{' '}
      - Responses are cached for {maxAge} seconds at the HTTP layer
      {sdkTtl && ` and ${sdkTtl} minutes in the SDK`}.
    </p>
  );
}
