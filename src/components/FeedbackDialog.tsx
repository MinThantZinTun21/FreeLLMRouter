import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Bug, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FeedbackType = 'general' | 'bug';

interface FormData {
  type: FeedbackType;
  message: string;
  email: string;
}

interface FormErrors {
  type?: string;
  message?: string;
  email?: string;
}

declare const turnstile:
  | {
      render: (el: HTMLElement, options: { sitekey: string }) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    }
  | undefined;

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    type: 'general',
    message: '',
    email: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  // Render Turnstile when dialog opens
  useEffect(() => {
    if (!open) return;

    // Wait for Sheet content to mount and turnstile script to load
    const timer = setTimeout(() => {
      if (!turnstileRef.current) {
        return;
      }
      if (typeof turnstile === 'undefined') {
        return;
      }
      if (widgetId.current) {
        return;
      }

      widgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (widgetId.current && typeof turnstile !== 'undefined') {
        turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [open]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.type) {
      newErrors.type = 'Please select a feedback type';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Please enter your feedback';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Feedback must be at least 10 characters';
    } else if (formData.message.length > 5000) {
      newErrors.message = 'Feedback is too long (max 5000 characters)';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      // Get token from the hidden input that Turnstile auto-creates
      const tokenInput = document.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]'
      );
      const token = tokenInput?.value || '';

      const response = await fetch('/api/site-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          message: formData.message.trim(),
          email: formData.email.trim(),
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
          'cf-turnstile-response': token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      toast.success('Thank you for your feedback!');
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ type: 'general', message: '', email: '' });
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
          <span className="">Feedback</span>
        </span>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Send Feedback</SheetTitle>
          <SheetDescription>
            Help us improve by sharing your thoughts or reporting issues.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <Select
              value={formData.type}
              onValueChange={(value: FeedbackType) =>
                setFormData((prev) => ({ ...prev, type: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select feedback type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    General Feedback
                  </span>
                </SelectItem>
                <SelectItem value="bug">
                  <span className="flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Bug Report
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.type && <p className="text-sm text-destructive">{errors.type}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {formData.type === 'bug' ? 'Describe the issue' : 'Your feedback'}
            </label>
            <textarea
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive w-full h-32 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder={
                formData.type === 'bug'
                  ? 'What happened? What did you expect to happen?'
                  : 'Share your thoughts, suggestions, or ideas...'
              }
              value={formData.message}
              onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
              aria-invalid={!!errors.message}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {errors.message ? (
                  <span className="text-destructive">{errors.message}</span>
                ) : (
                  'Minimum 10 characters'
                )}
              </span>
              <span>{formData.message.length}/5000</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              aria-invalid={!!errors.email}
            />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email}</p>
            ) : (
              <p className="text-xs text-muted-foreground">We'll use this to follow up</p>
            )}
          </div>

          {import.meta.env.PUBLIC_TURNSTILE_SITE_KEY && <div ref={turnstileRef} />}
        </div>

        <SheetFooter>
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
