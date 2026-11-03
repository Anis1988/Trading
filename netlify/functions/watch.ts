import { isStopped } from '../lib/state';
import { runWatch } from '../lib/watchCore';

// Background check once an hour on weekdays, 11:05-23:05 UTC (about 7am-7pm New York), even when the app is closed.
// Hourly and weekday-only to save Netlify credits: nights and weekends don't run at all.
export const config = { schedule: '5 11-23 * * 1-5' };

export default async (): Promise<Response> => {
  // ⛔ Stop pressed in the app: the background check doesn't run at all.
  if (await isStopped()) return new Response(null, { status: 204 });
  const r = await runWatch();
  console.log('watch', JSON.stringify(r));
  return new Response(null, { status: 204 });
};
