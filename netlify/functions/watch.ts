import { runWatch } from '../lib/watchCore';

// Background check every 15 minutes, even when the app is closed (Netlify Scheduled Function).
export const config = { schedule: '*/15 * * * *' };

export default async (): Promise<Response> => {
  const r = await runWatch();
  console.log('watch', JSON.stringify(r));
  return new Response(null, { status: 204 });
};
