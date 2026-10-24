import { useEffect, useState } from 'react';
import { isWholesale, type CatalogProduct, type Profile } from '@califnco/core';
import { subscribeCatalog } from '../../../../packages/core/src/catalog-store';
import { db } from '../firebase';

export function useCatalog(profile: Profile) {
  const access = isWholesale(profile) ? 'dealer' : 'retail';
  const [attempt, setAttempt] = useState(0);
  const scope = `${profile.id}:${access}:${attempt}`;
  const [state, setState] = useState<{ scope: string; products: CatalogProduct[]; loading: boolean; error: string }>({ scope, products: [], loading: true, error: '' });
  useEffect(() => {
    return subscribeCatalog(db, access, products => setState({ scope, products, loading: false, error: '' }), () => setState({ scope, products: [], loading: false, error: 'Could not load the catalog. Check your connection and try again.' }));
  }, [scope, access]);
  return { ...(state.scope === scope ? state : { products: [] as CatalogProduct[], loading: true, error: '' }), retry: () => setAttempt(n => n + 1) };
}
