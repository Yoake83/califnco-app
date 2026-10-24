import { useState } from 'react';
import type { Approval, Profile } from '@califnco/core';
import { db } from './firebase';
import { decideDealer } from './dealer-service';
import { accountError } from './AdminGate';

export function DealerPanel({ dealers, loading, error, retry }: { dealers: Profile[]; loading: boolean; error: string; retry: () => void }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<{ dealer: Profile; approval: Approval } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const visible = dealers.filter(d => (filter === 'All' || d.approval === filter) && `${d.name} ${d.businessName} ${d.email} ${d.phone}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="toolbar panel"><label className="search">Search<input aria-label="Search dealers" value={search} onChange={e => setSearch(e.target.value)} placeholder="Business, contact, email or phone" /></label><select aria-label="Filter dealer status" value={filter} onChange={e => setFilter(e.target.value)}>{['All', 'pending', 'approved', 'rejected'].map(status => <option key={status}>{status}</option>)}</select></div>
    {loading && <p role="status">Loading dealer applications…</p>}
    {error && <div role="alert" className="notice">{error}<button className="outline" onClick={retry}>Retry</button></div>}
    {message && <p role="status" className="notice">{message}</p>}
    {decision && <section role="dialog" aria-modal="false" aria-labelledby="decision-title" className="panel setup-panel decision"><h2 id="decision-title">Set {decision.dealer.businessName || decision.dealer.name} to {decision.approval}?</h2><p>{decision.approval === 'approved' ? 'This dealer will be able to order at wholesale prices.' : 'This dealer will be unable to place orders.'}</p><button className="primary" disabled={busy || !!error} onClick={async () => {
      if (busy) return;
      setBusy(true); setMessage('');
      try { await decideDealer(db, decision.dealer.id, decision.dealer.approval, decision.approval); setMessage(`Dealer status saved: ${decision.approval}.`); setDecision(null); }
      catch (failure) { setMessage(accountError(failure)); }
      finally { setBusy(false); }
    }}>{busy ? 'Saving…' : 'Confirm decision'}</button><button className="outline" disabled={busy} onClick={() => setDecision(null)}>Cancel</button></section>}
    {!loading && !error && !visible.length && <div className="empty">{dealers.length ? 'No matching applications.' : 'No dealer applications yet. New registrations will appear here.'}</div>}
    {!error && <div className="dealer-grid">{visible.map(dealer => <article key={dealer.id} className="panel dealer"><div className="row-between"><span className="company-avatar">{(dealer.businessName || dealer.name).slice(0, 2).toUpperCase()}</span><span className={`badge ${dealer.approval}`}>{dealer.approval}</span></div><h2>{dealer.businessName || dealer.name}</h2><p>{dealer.name}</p><p>{dealer.email}</p><p>{dealer.phone}</p><p>{dealer.address}</p><small>Application: {dealer.id}</small><div className="dealer-actions">{(['approved', 'rejected', 'pending'] as const).map(approval => <button className={approval === 'approved' ? 'primary' : 'outline'} key={approval} disabled={busy || dealer.approval === approval} onClick={() => { setMessage(''); setDecision({ dealer, approval }); }}>{approval === 'approved' ? 'Approve' : approval === 'rejected' ? 'Reject' : 'Reopen'}</button>)}</div></article>)}</div>}
  </>;
}
