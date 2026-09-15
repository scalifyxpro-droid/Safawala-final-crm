'use client';

import { useActionState, useState } from 'react';
import { Check, LoaderCircle, UsersRound } from 'lucide-react';
import {
  approveStylistSelectionAction,
  type AssignStylistsActionState,
} from '@/app/stylist-approvals/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Applicant = {
  id: string;
  name: string;
  status: 'interested' | 'approved' | 'rejected' | 'backup';
};
const INITIAL_STATE: AssignStylistsActionState = { error: '', saved: false };

export function StylistAssignmentPanel({
  jobId,
  requiredCount,
  applicants,
}: {
  jobId: string;
  requiredCount: number;
  applicants: Applicant[];
}) {
  const approved = applicants.filter(
    (applicant) => applicant.status === 'approved',
  );
  const interested = applicants.filter(
    (applicant) => applicant.status === 'interested',
  );
  const remaining = Math.max(0, requiredCount - approved.length);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(
    approveStylistSelectionAction,
    INITIAL_STATE,
  );
  const complete = remaining === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Interested stylists</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {approved.length} of {requiredCount} selected
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            complete
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }
        >
          {complete ? <Check /> : <UsersRound />}
          {complete ? 'Assigned' : `${remaining} remaining`}
        </Badge>
      </div>

      {approved.length ? (
        <div className="flex flex-wrap gap-2">
          {approved.map((applicant) => (
            <Badge
              key={applicant.id}
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              <Check />
              {applicant.name}
            </Badge>
          ))}
        </div>
      ) : null}

      {!complete && interested.length ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="jobId" value={jobId} />
          <div className="grid gap-2">
            {interested.map((applicant) => {
              const checked = selected.includes(applicant.id);
              const limitReached = selected.length >= remaining;
              return (
                <label
                  key={applicant.id}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-[#d7b98d] bg-[#fffaf2] dark:bg-[#241e17]' : 'border-border bg-white dark:bg-card'}`}
                >
                  <input
                    type="checkbox"
                    name="interestId"
                    value={applicant.id}
                    checked={checked}
                    disabled={pending || (!checked && limitReached)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, applicant.id]
                          : current.filter((id) => id !== applicant.id),
                      )
                    }
                  />
                  <span className="font-medium">{applicant.name}</span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Select exactly {remaining}. Other applicants close automatically
              after assignment.
            </p>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={pending || selected.length !== remaining}
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              {pending ? 'Assigning…' : 'Approve & assign'}
            </Button>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : !complete ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
          <span className="font-medium">Waiting for interest.</span>{' '}
          <span className="text-muted-foreground">
            Needs {remaining} more stylist{remaining === 1 ? '' : 's'}.
          </span>
        </div>
      ) : null}
    </div>
  );
}
