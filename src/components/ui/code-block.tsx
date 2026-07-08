import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { codeToHtml } from 'shiki';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  showCopy?: boolean;
  copyLabel?: string;
  className?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function CodeBlock({
  code,
  language = 'typescript',
  showCopy = true,
  copyLabel = 'Copy',
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<string | null>(null);

  useEffect(() => {
    codeToHtml(code, {
      lang: language,
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
    }).then(setHighlightedCode);
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative rounded-lg border bg-muted/50 overflow-hidden ${className}`}>
      {highlightedCode ? (
        <div
          className="max-h-[50vh] overflow-y-auto p-4 text-sm text-left leading-relaxed [&_pre]:bg-transparent! [&_pre]:whitespace-pre-wrap [&_pre]:wrap-break-word [&_code]:bg-transparent!"
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      ) : (
        <pre className="p-4 text-sm font-mono text-left leading-relaxed whitespace-pre-wrap wrap-break-word">
          <code>{code}</code>
        </pre>
      )}
      {showCopy && (
        <div className="absolute right-2 top-2">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {copyLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
