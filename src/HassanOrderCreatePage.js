import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QuotationCreateView } from './Quotationer';
import HassanShowroomOrderForm from './components/HassanShowroomOrderForm';
import { isQuotationerOnlyExperience } from './accessControl';
import { HASSAN_WEB_ORDERS_PATH } from './mobile/ordersAppDashboardParity';

const readLocalUser = () => {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch {}
  return null;
};

export default function HassanOrderCreatePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const quoteId = searchParams.get('quoteId') || '';
  const user = React.useMemo(() => readLocalUser(), []);
  const isQuotationerOnly = isQuotationerOnlyExperience(user, '/orders/create', searchParams.toString());
  const kind = quoteId
    ? 'customer'
    : (searchParams.get('kind') === 'showroom' ? 'showroom' : 'customer');

  const setKind = (next) => {
    if (quoteId) return;
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'showroom') nextParams.set('kind', 'showroom');
    else nextParams.delete('kind');
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="content quotes-page hassan-order-create-page" style={{ padding: 12, maxWidth: 1200, margin: '0 auto' }}>
      <div className="quotes-header page-header-row" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="action-button"
          style={{ padding: '8px 12px', fontSize: 13 }}
          onClick={() => navigate(HASSAN_WEB_ORDERS_PATH)}
        >
          Back to Orders
        </button>
        <h2 className="quotes-title" style={{ margin: 0, flex: 1 }}>
          {quoteId ? 'Edit order' : 'New Orders'}
        </h2>
      </div>

      {!quoteId ? (
        <div className="hassan-order-kind-switch" role="tablist" aria-label="Order type">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'customer'}
            className={`hassan-order-kind-switch__btn${kind === 'customer' ? ' active' : ''}`}
            onClick={() => setKind('customer')}
          >
            Customer order
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'showroom'}
            className={`hassan-order-kind-switch__btn${kind === 'showroom' ? ' active' : ''}`}
            onClick={() => setKind('showroom')}
          >
            Showroom order
          </button>
        </div>
      ) : null}

      {kind === 'showroom' && !quoteId ? (
        <HassanShowroomOrderForm onDonePath={HASSAN_WEB_ORDERS_PATH} />
      ) : (
        <QuotationCreateView
          key={`create-${quoteId || 'new'}`}
          quoteId={quoteId}
          hassanOrderCreateLayout={isQuotationerOnly}
          onBackHome={() => navigate(HASSAN_WEB_ORDERS_PATH)}
          onSaved={() => navigate(HASSAN_WEB_ORDERS_PATH)}
        />
      )}
    </div>
  );
}