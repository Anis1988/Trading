import emailjs from '@emailjs/browser';
import type { Signal } from '../types';
import { config } from './config';
import { EXEC_NOTE, formatInstruction, type OrderPlan } from './instructions';

/**
 * Sends the trade instruction. The full text is provided under several variable names
 * (instructions / message / intake_summary) so it renders in templates that only use one of them.
 * Also available: to_email, subject, action, symbol, quantity, order_type, limit_price,
 * reason, confidence, timestamp, note, from_name, reply_to.
 */
export async function sendTradeEmail(sig: Signal, plan: OrderPlan, toEmail: string): Promise<void> {
  if (!config.emailServiceId || !config.emailTemplateId || !config.emailUserId) {
    throw new Error('EmailJS is not configured (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID).');
  }
  if (!/^\S+@\S+\.\S+$/.test(toEmail)) throw new Error('Enter a valid recipient email in Settings.');
  const text = formatInstruction(sig, plan);
  const subject = `${sig.side} ${sig.qty} ${sig.symbol} (${(sig.confidence * 100).toFixed(0)}% confidence)`;
  await emailjs.send(
    config.emailServiceId,
    config.emailTemplateId,
    {
      to_email: toEmail,
      subject,
      from_name: 'Trading Assistant',
      reply_to: toEmail,
      action: sig.side,
      symbol: sig.symbol,
      quantity: sig.qty,
      order_type: plan.orderType,
      limit_price: plan.limitPrice ? plan.limitPrice.toFixed(2) : 'n/a',
      reason: sig.reason,
      confidence: `${(sig.confidence * 100).toFixed(0)}%`,
      timestamp: sig.createdAt,
      note: EXEC_NOTE,
      instructions: text,
      message: text,
      intake_summary: text,
    },
    { publicKey: config.emailUserId },
  );
}
