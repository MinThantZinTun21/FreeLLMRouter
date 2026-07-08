import { useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function UsageBanner() {
  const [isDismissed, setIsDismissed] = useLocalStorage('freeModels:bannerDismissed', false);

  // Early return if dismissed - prevents flash of content
  if (isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <Alert variant="warning" className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Use responsibly</strong> - Abuse of this free service may cause us to lose
              access to these models. Intended for MVPs, POCs, and fallback use only.
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
}
