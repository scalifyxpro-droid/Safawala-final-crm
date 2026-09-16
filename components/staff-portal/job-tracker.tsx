import { Check, Circle, Route } from 'lucide-react';
import { trackingTimeline, TRACKING_STAGE_LABEL } from '@/lib/event-jobs/constants';
import type { EventJobStage, StylistExecutionEntry } from '@/lib/event-jobs/types';

export function JobTracker({ stages, stylistExecutions }: { stages: EventJobStage[]; stylistExecutions?: StylistExecutionEntry[] }) {
  return (
    <details className="group rounded-xl border bg-white dark:bg-card shadow-level-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
        <span className="flex items-center gap-2">
          <Route className="size-4 text-[#9a6a2f]" /> Track this job
        </span>
        <span className="text-xs text-muted-foreground group-open:hidden">
          View current progress
        </span>
      </summary>
      <ol className="space-y-0 border-t px-5 py-3">
        {trackingTimeline(stages, stylistExecutions).map((stage, index, orderedStages) => {
          const done = stage.status === 'done';
          const current =
            stage.status === 'open' || stage.status === 'in_progress';
          return (
            <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-1">
              {index < orderedStages.length - 1 ? (
                <span className="absolute left-[9px] top-5 h-full w-px bg-border" />
              ) : null}
              <span
                className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                  done
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : current
                      ? 'border-[#a86f2c] bg-[#f5ead8] text-[#70481c]'
                      : 'border-border bg-white dark:bg-card text-muted-foreground'
                }`}
              >
                {done ? (
                  <Check className="size-3" />
                ) : (
                  <Circle className="size-2 fill-current" />
                )}
              </span>
              <span>
                <strong className="block text-sm font-medium">
                  {TRACKING_STAGE_LABEL[stage.key]}
                </strong>
                <span
                  className={`text-xs ${current ? 'text-[#9a6a2f]' : 'text-muted-foreground'}`}
                >
                  {done ? 'Completed' : current ? 'In progress' : 'Waiting'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
