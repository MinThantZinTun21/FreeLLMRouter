import { signIn, useCachedSession } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function LoginPage() {
  const { data: session, isPending } = useCachedSession();

  const handleGithubSignIn = async () => {
    await signIn.social({
      provider: 'github',
      callbackURL: '/dashboard',
    });
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
        <Button className="w-full" onClick={handleGithubSignIn} disabled={isPending}>
          Sign in with GitHub
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          After sign-in, you will be redirected to your dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
