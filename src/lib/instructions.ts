import type { OrderType, Signal } from '../types';
import { confirmLine } from './holdings';

export interface OrderPlan {
  orderType: OrderType;
  limitPrice?: number;
}

export function planOrder(limitPrice?: number): OrderPlan {
  return limitPrice && limitPrice > 0 ? { orderType: 'LIMIT', limitPrice } : { orderType: 'MARKET' };
}

export const EXEC_NOTE =
  'After execution, update the app by marking this instruction as executed and add order id and executed price.';

export function formatInstruction(sig: Signal, plan: OrderPlan): string {
  return [
    `Action: ${sig.side}`,
    `Symbol: ${sig.symbol}`,
    `Quantity: ${sig.qty}`,
    `Order type: ${plan.orderType}${plan.limitPrice ? ` @ ${plan.limitPrice.toFixed(2)}` : ''}`,
    `Reason: ${sig.reason}`,
    `Confidence: ${(sig.confidence * 100).toFixed(0)}%`,
    ...(sig.stopPrice ? [`Suggested stop-loss: $${sig.stopPrice.toFixed(2)} (about $${((sig.entryPrice! - sig.stopPrice) * sig.qty).toFixed(0)} maximum loss at ${sig.qty} shares)`] : []),
    ...(sig.review
      ? [
          `AI review: ${sig.review.rationale}`,
          ...(sig.review.holdingNote ? [`Your holdings: ${sig.review.holdingNote}`] : []),
          ...(sig.review.risks.length ? [`Watch out: ${sig.review.risks.join('; ')}`] : []),
          confirmLine(sig.review.verdict, sig.side, sig.qty, sig.symbol),
        ]
      : []),
    `Timestamp: ${sig.createdAt}`,
    '',
    `Place this order manually in your Fidelity account. This app is not a broker and has not placed any order.`,
    EXEC_NOTE,
  ].join('\n');
}
