import { runBrief } from '../lib/briefCore';

// ☀️ Weekdays 13:05 UTC: 9:05am New York in summer, 8:05am in winter, before the 9:30 open.
export const config = { schedule: '5 13 * * 1-5' };

export default async (): Promise<Response> => {
  try {
    const r = await runBrief();
    console.log('brief', r.sent, r.reason ?? '');
  } catch (e) {
    console.error('brief failed', e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
};
