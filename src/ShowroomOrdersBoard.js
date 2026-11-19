import React from 'react';
import QuotesBoard from './QuotesBoard';

/** Showroom quote list — same table as factory orders, filtered to showroom_order routings. */
export default function ShowroomOrdersBoard() {
  return <QuotesBoard boardMode="showroom" />;
}