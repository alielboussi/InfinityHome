import React from 'react';
import WarehouseFloor2Page from './WarehouseFloor2Page';

export default function HassanFloor2Page() {
  return (
    <WarehouseFloor2Page
      readOnly
      loadFreshOnMount
      pageTitle="Floor 2"
      pageSubtitle="Photo, SKU, product, and stock on hand (same Floor 2 WIP as Warehouses → Floor 2 — read-only)."
    />
  );
}