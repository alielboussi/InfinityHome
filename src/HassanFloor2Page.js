import React from 'react';
import WarehouseFloor2Page from './WarehouseFloor2Page';

export default function HassanFloor2Page() {
  return (
    <WarehouseFloor2Page
      readOnly
      loadFreshOnMount
      floor2StockPhysicalOnly
      pageTitle="Floor 2"
      pageSubtitle="Unfinished WIP with stock on Warehouse Floor 2 (or a Floor 2 photo) — not the Floor 1 product catalog."
    />
  );
}