import { ThemeToggle } from '@/components/ThemeToggle';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { useCachedSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

interface SiteHeaderProps {
  showSidebarTrigger?: boolean;
}

export function SiteHeader({ showSidebarTrigger = true }: SiteHeaderProps) {
  const { data: session, isPending } = useCachedSession();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 shrink-0 items-center border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex w-full items-center gap-3 px-4">
        <div className="flex items-center gap-3 md:gap-6">
          {showSidebarTrigger && <SidebarTrigger className="md:hidden" />}
          <a href="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="h-5 w-5" />
            <span className="hidden sm:inline text-sm sm:text-base">Free LLM Router</span>
          </a>
          <nav className="items-center gap-4 flex">
            <a href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
              Docs
            </a>
            <a href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a href="/models" className="text-sm text-muted-foreground hover:text-foreground">
              Models
            </a>
            <div className="hidden md:block">
              <FeedbackDialog />
            </div>
          </nav>
        </div>
        <div className="flex-1" />
        {!isPending &&
          (session?.user ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs sm:px-3 sm:text-sm"
              asChild
            >
              <a href="/dashboard">Dashboard</a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs sm:px-3 sm:text-sm"
              asChild
            >
              <a href="/login">Sign In</a>
            </Button>
          ))}
        <ThemeToggle />
      </div>
    </header>
  );
}
