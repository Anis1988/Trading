import type { OrderType, Signal } from '../types';

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
    ...(sig.review ? [`AI review: ${sig.review.verdict}${sig.review.simulated ? ' (simulated)' : ''} - ${sig.review.rationale}`, ...(sig.review.risks.length ? [`AI risks: ${sig.review.risks.join('; ')}`] : [])] : []),
    `Timestamp: ${sig.createdAt}`,
    '',
    `Place this order manually in your Fidelity account. This app is not a broker and has not placed any order.`,
    EXEC_NOTE,
  ].join('\n');
}
