import type { ReactNode } from 'react';

interface ApiEndpointProps {
  id: string;
  children: ReactNode;
}

export function ApiEndpoint({ id, children }: ApiEndpointProps) {
  return (
    <div id={id} className="scroll-mt-20 space-y-6">
      {children}
    </div>
  );
}
