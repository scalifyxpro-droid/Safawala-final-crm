'use client';

import { useState } from 'react';
import { submitBookingFeedbackAction } from '@/app/feedback/[bookingId]/actions';

export function FeedbackForm({ bookingId }: { bookingId: number }) {
  const [rating, setRating] = useState(0);
  const [experience, setExperience] = useState('');
  const [comment, setComment] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="mt-6 rounded-lg bg-[#f6efe2] px-4 py-6 text-center">
        <p className="text-sm font-medium text-neutral-800">
          Thank you for your feedback! We truly appreciate it. 🙏
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        if (rating < 1) {
          setError('Please choose a rating.');
          return;
        }
        setSubmitting(true);
        const result = await submitBookingFeedbackAction(bookingId, {
          rating,
          experience,
          comment,
          suggestions,
        });
        setSubmitting(false);
        if (result.error) {
          setError(result.error);
          return;
        }
        setDone(true);
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Overall rating</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} star${value > 1 ? 's' : ''}`}
              className={
                'text-3xl leading-none transition-colors ' +
                (value <= rating ? 'text-[#d9a656]' : 'text-neutral-200')
              }
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Overall experience
        </label>
        <input
          type="text"
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder="e.g. Excellent service"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#9a6728]"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Comments <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#9a6728]"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Suggestions <span className="text-neutral-400">(optional)</span>
        </label>
        <textarea
          value={suggestions}
          onChange={(e) => setSuggestions(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#9a6728]"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-[#9a6728] px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit Feedback'}
      </button>
    </form>
  );
}
