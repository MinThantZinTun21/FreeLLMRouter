import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:translate-y-0',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground border-foreground/20',
        destructive:
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        warning:
          'border-[oklch(0.85_0.08_70)] bg-[oklch(0.98_0.02_70)] text-[oklch(0.35_0.08_70)] dark:border-[oklch(0.40_0.08_70)] dark:bg-[oklch(0.25_0.05_70)] dark:text-[oklch(0.85_0.08_70)] [&>svg]:text-[oklch(0.60_0.12_70)] dark:[&>svg]:text-[oklch(0.75_0.10_70)]',
        success:
          'border-green-200 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100 [&>svg]:text-green-600 dark:[&>svg]:text-green-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };
