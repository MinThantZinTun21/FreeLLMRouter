import { Rocket, Book, Code, ChevronRight, Settings, SlidersHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SubItem {
  title: string;
  href: string;
  badge?: 'GET' | 'POST';
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: SubItem[];
}

const navItems: NavItem[] = [
  {
    title: 'Get Started',
    href: '#get-started',
    icon: Rocket,
    items: [
      { title: 'Overview', href: '#get-started' },
      { title: '1. Set Up OpenRouter', href: '#setup-openrouter' },
      { title: '2. Get API Key', href: '#get-api-key' },
      { title: '3. Copy Helper File', href: '#copy-file' },
      { title: '4. Use It', href: '#use-it' },
      { title: '5. Further Configure Parameters', href: '#further-configure-params' },
    ],
  },
  {
    title: 'Parameter Configuration',
    href: '#parameter-configuration',
    icon: SlidersHorizontal,
    items: [
      { title: 'Overview', href: '#parameter-configuration-overview' },
      { title: 'Configure Parameters', href: '#configure-params-live' },
      { title: 'Key Defaults', href: '#key-defaults' },
      { title: 'Request Overrides', href: '#request-overrides' },
    ],
  },
  {
    title: 'Code Examples',
    href: '#code-examples',
    icon: Code,
    items: [
      { title: 'Basic Usage', href: '#example-basic-fallback' },
      { title: 'One-off API Call', href: '#example-one-off' },
      { title: 'Chatbot', href: '#example-chatbot' },
      { title: 'Tool Calling', href: '#example-tool-calling' },
    ],
  },
  {
    title: 'API Reference',
    href: '#api-reference',
    icon: Book,
    items: [
      { title: '/models/ids', href: '#api-get-models', badge: 'GET' },
      { title: '/models/full', href: '#api-get-models-full', badge: 'GET' },
      { title: '/models/feedback', href: '#api-post-feedback', badge: 'POST' },
    ],
  },
  {
    title: 'Query Parameters',
    href: '#query-params',
    icon: Settings,
    items: [
      { title: 'useCase', href: '#param-useCase' },
      { title: 'sort', href: '#param-sort' },
      { title: 'topN', href: '#param-topN' },
      { title: 'maxErrorRate', href: '#param-maxErrorRate' },
      { title: 'timeRange', href: '#param-timeRange' },
      { title: 'myReports', href: '#param-myReports' },
    ],
  },
];

function NavItemWithSub({ item, activeHash }: { item: NavItem; activeHash: string }) {
  if (!item.items) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={item.title}>
          <a href={item.href}>
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="ml-4 mt-1 space-y-1 border-l pl-2">
            {item.items.map((subItem) => {
              const isActive = activeHash === subItem.href.slice(1);
              return (
                <li key={subItem.title}>
                  <a
                    href={subItem.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {subItem.badge && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          subItem.badge === 'GET'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        )}
                      >
                        {subItem.badge}
                      </span>
                    )}
                    <span className={subItem.badge ? 'font-mono text-xs' : ''}>
                      {subItem.title}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

// Get all section IDs for intersection observer
const allSectionIds = navItems.flatMap(
  (item) => item.items?.map((sub) => sub.href.slice(1)) ?? [item.href.slice(1)]
);

export function AppSidebar() {
  const [activeHash, setActiveHash] = useState('get-started');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible section
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) {
          setActiveHash(visible.target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );

    // Observe all sections
    allSectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="sticky top-14 h-[calc(100vh-3.5rem)] border-r bg-background"
    >
      <SidebarContent className="p-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <NavItemWithSub key={item.title} item={item} activeHash={activeHash} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
