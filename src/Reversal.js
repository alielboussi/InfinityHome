import React from 'react';
import { Navigate } from 'react-router-dom';

/** Legacy route — sale adjustments live on Point of Sale. */
export default function Reversal() {
  return <Navigate to="/all-sales?adjust=sale" replace />;
}
