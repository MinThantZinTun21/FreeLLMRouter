import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface OnboardingStepProps {
  stepNumber: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  onConfirm?: () => void;
  showConfirm?: boolean;
  confirmLabel?: string;
  wide?: boolean;
}

export function OnboardingStep({
  stepNumber,
  title,
  description,
  children,
  onConfirm,
  showConfirm = true,
  confirmLabel = 'Continue',
  wide = false,
}: OnboardingStepProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-10 py-10">
      {/* Step Header */}
      <div className="flex flex-col items-center text-center space-y-2">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Step {stepNumber}
        </span>
        <h2 className="text-4xl font-bold sm:text-5xl">{title}</h2>
        {description && <p className="text-lg text-muted-foreground">{description}</p>}
      </div>

      {/* Step Content */}
      <div className={wide ? 'max-w-3xl w-full text-left' : 'max-w-xl'}>{children}</div>

      {/* Confirm Button */}
      {showConfirm && onConfirm && (
        <Button size="lg" onClick={onConfirm}>
          {confirmLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
