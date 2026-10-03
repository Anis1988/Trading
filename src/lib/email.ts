import emailjs from '@emailjs/browser';
import type { Signal } from '../types';
import { config } from './config';
import { EXEC_NOTE, formatInstruction, type OrderPlan } from './instructions';

/**
 * EmailJS template variables expected:
 *  to_email, subject, action, symbol, quantity, order_type, limit_price,
 *  reason, confidence, timestamp, note, instructions
 */
export async function sendTradeEmail(sig: Signal, plan: OrderPlan, toEmail: string): Promise<void> {
  if (!config.emailServiceId || !config.emailTemplateId || !config.emailUserId) {
    throw new Error('EmailJS is not configured (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID).');
  }
  if (!/^\S+@\S+\.\S+$/.test(toEmail)) throw new Error('Enter a valid recipient email in Settings.');
  await emailjs.send(
    config.emailServiceId,
    config.emailTemplateId,
    {
      to_email: toEmail,
      subject: `${sig.side} ${sig.qty} ${sig.symbol} (${(sig.confidence * 100).toFixed(0)}% confidence)`,
      action: sig.side,
      symbol: sig.symbol,
      quantity: sig.qty,
      order_type: plan.orderType,
      limit_price: plan.limitPrice ? plan.limitPrice.toFixed(2) : 'n/a',
      reason: sig.reason,
      confidence: `${(sig.confidence * 100).toFixed(0)}%`,
      timestamp: sig.createdAt,
      note: EXEC_NOTE,
      instructions: formatInstruction(sig, plan),
    },
    { publicKey: config.emailUserId },
  );
}
