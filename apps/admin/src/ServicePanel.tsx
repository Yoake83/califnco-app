import { useEffect, useState } from 'react';
import type { ServiceRequest } from '@califnco/core';
import { setServiceStatus, subscribeServices } from '../../../packages/core/src/service-store';
import { db } from './firebase';
import { accountError } from './AdminGate';

export function ServicePanel() {
  const [services, setServices] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('All');
  useEffect(() => subscribeServices(db, null, records => { setServices(records); setLoading(false); setError(''); }, failure => { setServices([]); setLoading(false); setError(accountError(failure)); }), [retry]);
  return <section className="panel"><div className="toolbar"><h2>Service requests</h2><select aria-label="Filter services" value={filter} onChange={e => setFilter(e.target.value)}>{['All', 'Open', 'Assigned', 'Resolved'].map(status => <option key={status}>{status}</option>)}</select></div>
    {loading && <p className="empty" role="status">Loading service requests…</p>}
    {error && <p role="alert" className="notice">{error}<button className="outline" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!error && <div className="table-scroll"><table><thead><tr><th>Request</th><th>Customer</th><th>Preferred date</th><th>Address and notes</th><th>Status</th></tr></thead><tbody>{services.filter(request => filter === 'All' || request.status === filter).map(request => <tr key={request.id}><td><strong>{request.type}</strong><small>{request.id}</small></td><td>{request.customer}<small>{request.phone}</small></td><td>{request.date}</td><td>{request.address}<small>{request.notes}</small></td><td><select aria-label={`Status for ${request.id}`} value={request.status} disabled={!!busy} onChange={async e => {
      const status = e.target.value as ServiceRequest['status']; setBusy(request.id); setMessage('');
      try { await setServiceStatus(db, request.id, request.status, status); setMessage('Service status saved. The customer will see this update.'); }
      catch (failure) { setMessage(accountError(failure)); } finally { setBusy(''); }
    }}>{['Open', 'Assigned', 'Resolved'].map(status => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>}
    {!loading && !error && !services.length && <p className="empty">No service requests yet.</p>}
  </section>;
}
