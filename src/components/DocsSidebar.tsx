import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { SiteHeader } from '@/components/SiteHeader';

interface DocsSidebarProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * The mobile hamburger menu (SidebarTrigger) needs to toggle the sidebar,
 * but that only works if both are in the same React tree sharing SidebarProvider context.
 * By including SiteHeader inside this component, they share the same provider.
 */
export function DocsSidebar({ children, defaultOpen = true }: DocsSidebarProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SiteHeader showSidebarTrigger={true} />
      <AppSidebar />
      <main className="min-h-screen w-full pl-0 md:pl-[--sidebar-width]">{children}</main>
    </SidebarProvider>
  );
}
