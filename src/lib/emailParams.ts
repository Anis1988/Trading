import type { Signal } from '../types';
import { EXEC_NOTE, formatInstruction, type OrderPlan } from './instructions';

/**
 * EmailJS template variables. The full text is provided under several names
 * (instructions / message / intake_summary) so it renders in templates that only use one of them.
 */
export function tradeEmailParams(sig: Signal, plan: OrderPlan, toEmail: string): Record<string, string | number> {
  const text = formatInstruction(sig, plan);
  return {
    to_email: toEmail,
    subject: `${sig.side} ${sig.qty} ${sig.symbol} (${(sig.confidence * 100).toFixed(0)}% confidence)`,
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
  };
}

/** A plain-text email (weekly summary, tests) through the same template. */
export function textEmailParams(subject: string, text: string, toEmail: string): Record<string, string> {
  return {
    to_email: toEmail, subject, from_name: 'Trading Assistant', reply_to: toEmail, action: '', symbol: '', quantity: '', order_type: '', limit_price: '',
    reason: '', confidence: '', timestamp: new Date().toISOString(), note: '', instructions: text, message: text, intake_summary: text,
  };
}
