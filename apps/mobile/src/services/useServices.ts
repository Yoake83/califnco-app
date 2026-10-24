import { useEffect, useState } from 'react';
import type { ServiceRequest } from '@califnco/core';
import { subscribeServices } from '../../../../packages/core/src/service-store';
import { db } from '../firebase';

export function useServices(uid: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ services: ServiceRequest[]; loading: boolean; error: string }>({ services: [], loading: true, error: '' });
  useEffect(() => subscribeServices(db, uid, services => setState({ services, loading: false, error: '' }), () => setState({ services: [], loading: false, error: 'Could not load your service requests. Please try again.' })), [uid, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}
