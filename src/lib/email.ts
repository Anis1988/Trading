import emailjs from '@emailjs/browser';
import type { Signal } from '../types';
import { config } from './config';
import type { OrderPlan } from './instructions';
import { tradeEmailParams } from './emailParams';

export async function sendTradeEmail(sig: Signal, plan: OrderPlan, toEmail: string): Promise<void> {
  if (!config.emailServiceId || !config.emailTemplateId || !config.emailUserId) {
    throw new Error('EmailJS is not configured (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID).');
  }
  if (!/^\S+@\S+\.\S+$/.test(toEmail)) throw new Error('Enter a valid recipient email in Settings.');
  await emailjs.send(config.emailServiceId, config.emailTemplateId, tradeEmailParams(sig, plan, toEmail), { publicKey: config.emailUserId });
}
