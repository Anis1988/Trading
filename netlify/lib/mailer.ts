/** Server-side EmailJS (REST). Needs EMAILJS_PRIVATE_KEY and "Allow EmailJS API for non-browser applications" in EmailJS. */
export const serverEmailReady = () =>
  !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID && process.env.EMAILJS_USER_ID && process.env.EMAILJS_PRIVATE_KEY);

export async function sendServerEmail(params: Record<string, string | number>): Promise<void> {
  if (!serverEmailReady()) throw new Error('Server email needs EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID and EMAILJS_PRIVATE_KEY in Netlify.');
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_USER_ID,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`EmailJS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
