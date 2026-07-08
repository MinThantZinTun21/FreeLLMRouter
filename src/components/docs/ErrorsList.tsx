interface ErrorsListProps {
  errors: Array<{
    code: number;
    description: string;
  }>;
}

export function ErrorsList({ errors }: ErrorsListProps) {
  return (
    <div>
      <h4 className="mb-3 font-medium">Errors</h4>
      <ul className="list-inside list-disc text-sm text-muted-foreground space-y-1">
        {errors.map((error) => (
          <li key={error.code}>
            <code className="bg-muted px-1 py-0.5 rounded">{error.code}</code> - {error.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
