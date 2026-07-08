import { useCachedSession } from '@/lib/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginPage() {
  const { data: session, isPending } = useCachedSession();

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
        <CardDescription>GitHub sign-in has been removed for this deployment.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">
          Configure your own auth provider or use API-key based workflows for integrations.
        </p>
      </CardContent>
    </Card>
  );
}
