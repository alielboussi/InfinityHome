import React from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import HassanShowroomOrderForm from './components/HassanShowroomOrderForm';
import { isQuotationerOnlyExperience } from './accessControl';

const readLocalUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function ShowroomOrderCreate() {
  const user = readLocalUser();
  const hassanOnly = isQuotationerOnlyExperience(user, '/showroom-orders/create', '');
  if (hassanOnly) {
    return <Navigate to="/orders/create?kind=showroom" replace />;
  }

  return (
    <div className="content quotes-page showroom-order-create-page" style={{ padding: 12, maxWidth: 1100, margin: '0 auto' }}>
      <div className="quotes-header page-header-row" style={{ marginBottom: 12 }}>
        <BackToDashboard />
        <h2 className="quotes-title" style={{ margin: 0 }}>Showroom Orders</h2>
      </div>
      <HassanShowroomOrderForm onDonePath="/showroom-orders" />
    </div>
  );
}