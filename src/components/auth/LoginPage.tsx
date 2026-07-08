import { useState } from 'react';
import { signIn, useCachedSession } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function LoginPage() {
  const { data: session, isPending } = useCachedSession();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGithubSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      const result = await signIn.social({
        provider: 'github',
        callbackURL: '/dashboard',
      });
      if (result.error) {
        setError(result.error.message || 'GitHub sign-in failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GitHub sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  // If already logged in, redirect to dashboard
  if (!isPending && session?.user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
    return (
      <Card className="w-full">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Redirecting to dashboard...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign In</CardTitle>
        <CardDescription>
          Continue with GitHub to access your dashboard and API keys.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button className="w-full" onClick={handleGithubSignIn} disabled={isPending || isSigningIn}>
          {isSigningIn ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
        </Button>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <p className="text-center text-sm text-muted-foreground">
          After sign-in, you will be redirected to your dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
