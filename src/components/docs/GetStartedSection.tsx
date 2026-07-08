import { ApiUsageStep } from '@/components/ApiUsageStep';
import { QueryProvider } from '@/components/QueryProvider';

export function GetStartedSection() {
  return (
    <section id="get-started" className="mt-20 scroll-mt-20">
      <h2 className="mb-4 text-5xl font-bold">Get Started</h2>
      <p className="mb-4 text-2xl text-muted-foreground">
        Building a demo or prototyping an MVP but don’t want to pay API costs just to validate an
        idea?
      </p>
      <p className="mb-4 text-base text-muted-foreground">
        <a
          href="https://openrouter.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          OpenRouter
        </a>
        's free tier is generous for early development, but free models come with maintenance
        trade-offs. They can get rate limited, hit capacity, or disappear without notice—leaving you
        to juggle fallbacks and slow down shipping.
      </p>
      <p className="mb-12 text-base text-muted-foreground">
        We maintain a live-updated list of available free models so you don't have to track
        availability yourself. Set your preferences using use case and sorting, fetch the list from
        our API, and pass the model IDs to{' '}
        <a
          href="https://openrouter.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          OpenRouter
        </a>
        . It will automatically try each model in the order you specified until one responds. No
        need to manage fallbacks or check which models are currently working.
      </p>

      <ApiUsageStep />
    </section>
  );
}

export function GetStartedSectionWithProvider() {
  return (
    <QueryProvider>
      <GetStartedSection />
    </QueryProvider>
  );
}
