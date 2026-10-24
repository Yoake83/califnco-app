import { useEffect, useState } from 'react';
import type { CommerceOrder } from '@califnco/core';
import { subscribeOrders } from '../../../../packages/core/src/order-store';
import { db } from '../firebase';

export function useOrders(uid: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ orders: CommerceOrder[]; loading: boolean; error: string }>({ orders: [], loading: true, error: '' });
  useEffect(() => subscribeOrders(db, uid, orders => setState({ orders, loading: false, error: '' }), () => setState({ orders: [], loading: false, error: 'Could not load your orders. Check your connection and try again.' })), [uid, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}
