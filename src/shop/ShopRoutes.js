import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ShopLayout from './ShopLayout';
import ShopLanding from './ShopLanding';
import ShopProducts from './ShopProducts';
import ShopCart from './ShopCart';
import ShopCheckout from './ShopCheckout';
import ShopAbout from './ShopAbout';
import ShopSupport from './ShopSupport';
import ShopOrderSuccess from './ShopOrderSuccess';

export default function ShopRoutes() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<ShopLanding />} />
        <Route path="products" element={<ShopProducts />} />
        <Route path="cart" element={<ShopCart />} />
        <Route path="checkout" element={<ShopCheckout />} />
        <Route path="order-success" element={<ShopOrderSuccess />} />
        <Route path="about" element={<ShopAbout />} />
        <Route path="support" element={<ShopSupport />} />
      </Route>
    </Routes>
  );
}
