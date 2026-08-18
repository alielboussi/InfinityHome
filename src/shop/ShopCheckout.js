import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchShopPaymentStatus, initiateShopPayment, sendCustomerOrderReceipt } from '../services/shopApi';
import { buildPosSalePdfUrlForWhatsApp } from '../services/whatsappPdfs';
import { notifySaleWhatsApp } from '../services/whatsappNotify';
import { clearShopCart, readShopCart, shopCartTotal } from './shopCartStorage';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  provider: 'mtn',
};

function formatTotal(total, currency) {
  const sym = String(currency || 'K').toUpperCase() === 'USD' ? '$' : 'K';
  return `${sym} ${Number(total || 0).toLocaleString()}`;
}

export default function ShopCheckout() {
  const navigate = useNavigate();
  const cart = readShopCart();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [awaitingOrder, setAwaitingOrder] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState('');

  const total = shopCartTotal(cart);
  const currency = cart[0]?.currency || 'K';

  const deliverOrderNotifications = async (result) => {
    const saleId = result?.sale?.id;
    if (!saleId) return;

    const pdf = await buildPosSalePdfUrlForWhatsApp({ saleId });
    const notifyResult = await notifySaleWhatsApp({
      saleId,
      channel: 'web',
      pdfUrl: pdf?.url,
      pdfFilename: pdf?.filename,
    });
    if (!notifyResult?.ok) {
      console.warn('Sale WhatsApp notify failed:', notifyResult?.error || notifyResult);
    }

    const email = String(result?.order?.customer?.email || form.email || '').trim();
    if (email && pdf?.url) {
      try {
        await sendCustomerOrderReceipt({
          orderId: result.order?.id,
          pdfUrl: pdf.url,
          pdfFilename: pdf.filename,
        });
      } catch (emailErr) {
        console.warn('Customer receipt email failed:', emailErr?.message || emailErr);
      }
    }
  };

  useEffect(() => {
    if (!awaitingOrder?.id) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const result = await fetchShopPaymentStatus(awaitingOrder.id);
        if (cancelled) return;

        if (result?.completed) {
          try {
            await deliverOrderNotifications(result);
          } catch (notifyErr) {
            console.warn('Post-payment notifications failed:', notifyErr?.message || notifyErr);
          }
          clearShopCart();
          window.dispatchEvent(new Event('shop-cart-updated'));
          navigate('/shop/order-success', {
            state: {
              orderId: result.order?.id,
              receiptNumber: result.order?.receipt_number,
            },
          });
          return;
        }

        if (result?.failed) {
          setError(result.order?.payment_failure_reason || 'Payment was not completed. Please try again.');
          setAwaitingOrder(null);
          setPaymentMessage('');
          return;
        }

        setPaymentMessage('Waiting for payment approval on your phone…');
      } catch (pollErr) {
        if (!cancelled) {
          setError(pollErr?.message || 'Could not verify payment status');
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [awaitingOrder, navigate]);

  if (!cart.length && !awaitingOrder) {
    return (
      <div className="shop-page shop-page--narrow">
        <h1>Checkout</h1>
        <p className="shop-muted">Your cart is empty.</p>
      </div>
    );
  }

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setPaymentMessage('');
    try {
      const result = await initiateShopPayment({
        customer: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
        },
        provider: form.provider,
        currency,
        items: cart.map((row) => ({
          product_id: row.productId || row.id,
          variant_id: row.variantId || '',
          variant_name: row.variantName || '',
          display_name: row.name,
          quantity: row.quantity,
          unit_price: row.price,
          currency: row.currency,
        })),
      });

      const order = result?.order;
      if (!order?.id) throw new Error('Payment could not be started');

      setAwaitingOrder(order);
      setPaymentMessage(
        form.provider === 'airtel'
          ? 'Check your Airtel Money phone and approve the payment prompt.'
          : 'Check your MTN phone and approve the Mobile Money prompt.',
      );
    } catch (err) {
      setError(err?.message || 'Failed to start payment');
    } finally {
      setBusy(false);
    }
  };

  if (awaitingOrder) {
    return (
      <div className="shop-page shop-page--narrow shop-payment-wait">
        <h1>Approve payment</h1>
        <p className="shop-muted">{paymentMessage}</p>
        <div className="shop-payment-wait__card">
          <p><strong>Amount:</strong> {formatTotal(awaitingOrder.total_amount, awaitingOrder.currency)}</p>
          <p><strong>Phone:</strong> {form.phone}</p>
          <p className="shop-muted">Order reference: {awaitingOrder.id}</p>
        </div>
        {error && <p className="shop-error">{error}</p>}
        <p className="shop-muted">This page updates automatically once payment is received.</p>
      </div>
    );
  }

  return (
    <div className="shop-page shop-page--narrow">
      <h1>Checkout</h1>
      <p className="shop-muted">
        Pay with MTN Mobile Money or Airtel Money. Stock is checked now and deducted only after payment succeeds.
      </p>

      <form className="shop-form" onSubmit={handleSubmit}>
        <div className="shop-form__grid">
          <label>
            First name
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
          </label>
          <label>
            Last name
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
          </label>
        </div>
        <label>
          Email
          <input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
        </label>
        <label>
          Phone (mobile money number)
          <input required value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="e.g. 097 123 4567" />
        </label>
        <label>
          Address
          <input required value={form.address} onChange={(e) => update('address', e.target.value)} />
        </label>
        <label>
          City
          <input required value={form.city} onChange={(e) => update('city', e.target.value)} />
        </label>

        <fieldset className="shop-payment-methods">
          <legend>Pay with</legend>
          <label className="shop-payment-methods__option">
            <input
              type="radio"
              name="provider"
              value="mtn"
              checked={form.provider === 'mtn'}
              onChange={(e) => update('provider', e.target.value)}
            />
            MTN Mobile Money
          </label>
          <label className="shop-payment-methods__option">
            <input
              type="radio"
              name="provider"
              value="airtel"
              checked={form.provider === 'airtel'}
              onChange={(e) => update('provider', e.target.value)}
            />
            Airtel Money
          </label>
        </fieldset>

        <div className="shop-checkout-total">
          <span>Order total</span>
          <strong>{formatTotal(total, currency)}</strong>
        </div>

        {error && <p className="shop-error">{error}</p>}

        <button type="submit" className="shop-btn shop-btn--primary shop-btn--block" disabled={busy}>
          {busy ? 'Starting payment…' : 'Pay now'}
        </button>
      </form>
    </div>
  );
}
