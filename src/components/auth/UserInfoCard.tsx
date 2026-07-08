import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth-client';

interface UserInfoProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function UserInfo({ user }: UserInfoProps) {
  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/';
        },
      },
    });
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        {user.image && (
          <img src={user.image} alt={user.name || 'User'} className="h-12 w-12 rounded-full" />
        )}
        <div>
          <h2 className="text-xl font-semibold">{user.name}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <Button variant="outline" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
