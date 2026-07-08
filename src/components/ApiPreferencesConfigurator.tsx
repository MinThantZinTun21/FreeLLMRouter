import type { ReactNode } from 'react';
import { ModelControls } from '@/components/ModelControls';
import { ModelList } from '@/components/ModelList';

interface ApiPreferencesConfiguratorProps {
  modelControlsProps: React.ComponentProps<typeof ModelControls>;
  modelListProps: React.ComponentProps<typeof ModelList>;
  bottomRow?: ReactNode;
  helper?: ReactNode;
}

export function ApiPreferencesConfigurator({
  modelControlsProps,
  modelListProps,
  bottomRow,
  helper,
}: ApiPreferencesConfiguratorProps) {
  return (
    <div className="space-y-3">
      {bottomRow}
      <div className="mb-6">
        <ModelControls {...modelControlsProps} />
      </div>
      <ModelList {...modelListProps} />
      {helper && <p className="text-sm text-muted-foreground">{helper}</p>}
    </div>
  );
}
