import { Button } from '@/components/ui/button';
import { Check, ExternalLink } from 'lucide-react';

const FREE_TIER_POINTS = [
  'Daily limit: 200 requests (resets every day)',
  'Sign up and start using the hosted API right away',
  'Includes community health data',
  "I'm giving this away for free, so please don't abuse it :)",
];

const OPEN_SOURCE_POINTS = [
  'Full source code available',
  'Run it however you want',
  'No hosted limits from us',
  'You manage your own infrastructure and costs',
];

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-24">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Simplest way to get started. No paid plans.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm sm:p-8">
          <h3 className="text-2xl font-semibold">Free Tier</h3>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-bold">$0</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">200 requests/day</p>

          <ul className="mt-6 space-y-3">
            {FREE_TIER_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <a href="/login">
              <Button className="w-full">Start Free</Button>
            </a>
          </div>
        </article>

        <article className="rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur-sm sm:p-8">
          <h3 className="text-2xl font-semibold">Open Sourced</h3>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-bold">$0</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Self-hosted</p>

          <ul className="mt-6 space-y-3">
            {OPEN_SOURCE_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <a href="https://github.com/kaihochak/free-models-api" target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full">
                View on GitHub
              </Button>
            </a>
          </div>
        </article>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Hosted Free Tier has hard daily limits so we can keep the service sustainable for everyone.
        If you really really need more, feel free to reach out to me.
      </p>
    </section>
  );
}
