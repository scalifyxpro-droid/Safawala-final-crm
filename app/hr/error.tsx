'use client';

import { useEffect } from 'react';
import { ArrowLeft, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function HrError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('HR route error', error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f4ef] p-6 dark:bg-background">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 p-7">
          <span className="grid size-11 place-items-center rounded-xl bg-[#f5ead8] text-[#70481c]">
            <TriangleAlert className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">This HR page needs to be reloaded</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your data has not been changed. Retry the page, or return to the HR dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}><RefreshCw />Retry</Button>
            <Button variant="outline" onClick={() => { window.location.href = '/hr'; }}>
              <ArrowLeft />Back to HR
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
