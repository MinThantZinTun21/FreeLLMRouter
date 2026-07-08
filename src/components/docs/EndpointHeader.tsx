import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { siteConfig } from '@/lib/seo';

const METHOD_COLORS = {
  GET: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  PUT: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  DELETE: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

interface EndpointHeaderProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  description: string | ReactNode;
}

export function EndpointHeader({ method, endpoint, description }: EndpointHeaderProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${siteConfig.url}${endpoint}`);
    toast.success('Endpoint URL copied');
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
              METHOD_COLORS[method]
            }`}
          >
            {method}
          </span>
          <h3 className="font-mono text-lg font-medium">{endpoint}</h3>
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={handleCopy} className="shrink-0 h-8 w-8">
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
