import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy routes → unified Kitwe catalog page. */
export default function KitweSetsPage({ mode }) {
  const [searchParams] = useSearchParams();
  const qs = new URLSearchParams(searchParams);
  qs.delete('view');
  if (mode === 'create') qs.set('create', '1');
  else qs.delete('create');
  return <Navigate to={`/kitwe-products?${qs.toString()}`} replace />;
}
