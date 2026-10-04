import { runWeekly } from '../lib/weeklyCore';

// Fridays 21:00 UTC (5pm New York, after the close).
export const config = { schedule: '0 21 * * 5' };

export default async (): Promise<Response> => {
  try {
    console.log('weekly', JSON.stringify(await runWeekly()));
  } catch (e) {
    console.error('weekly failed', e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};
