import { QueryProvider } from '@/components/QueryProvider';
import { HealthTabContent } from '@/components/model-health/HealthTabContent';
import { AvailabilityTabContent } from '@/components/model-availability/AvailabilityTabContent';
import { cn } from '@/lib/utils';

type ModelsPageView = 'health' | 'availability';

interface ModelsPageProps {
  currentView?: ModelsPageView;
}

const PAGE_CONTENT: Record<
  ModelsPageView,
  {
    heading: string;
    description: string;
  }
> = {
  health: {
    heading: 'Free Model Health',
    description:
      'Browse community-reported health for free OpenRouter models. Compare reliability, error rates, and recent issue reports to find models that are actually working.',
  },
  availability: {
    heading: 'Free Model Availability',
    description:
      'Track daily availability history for free OpenRouter models. See which models stayed available over time and spot removals or downtime in OpenRouter sync data.',
  },
};

export function ModelsPage({ currentView = 'health' }: ModelsPageProps) {
  return (
    <QueryProvider>
      <ModelsPageContent currentView={currentView} />
    </QueryProvider>
  );
}

function ModelsPageContent({ currentView = 'health' }: ModelsPageProps) {
  const content = PAGE_CONTENT[currentView];

  return (
    <section className="scroll-mt-16 sm:mt-4">
      <h1 className="mb-3 text-3xl font-bold sm:mb-4 sm:text-5xl">{content.heading}</h1>
      <p className="mb-8 text-base text-muted-foreground sm:text-lg">{content.description}</p>
      <p className="mb-8 text-sm text-muted-foreground sm:text-base">
        We are not OpenRouter. Health data is community-reported, and availability is tracked from
        OpenRouter model syncs.
      </p>

      <nav className="mb-6" aria-label="Model sections">
        <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
          <a
            href="/models"
            aria-current={currentView === 'health' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              currentView === 'health'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            Health
          </a>
          <a
            href="/models/availability"
            aria-current={currentView === 'availability' ? 'page' : undefined}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              currentView === 'availability'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            )}
          >
            Availability
          </a>
        </div>
      </nav>

      <div className="w-full">
        {currentView === 'health' ? <HealthTabContent /> : <AvailabilityTabContent />}
      </div>
    </section>
  );
}
