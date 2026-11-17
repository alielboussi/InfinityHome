import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { brandLogoOnError } from '../utils/brandAssets';
import { buildLabelImageQrValue } from '../utils/labelImageQr';
import { matchesComboId } from '../utils/comboId';
import {
  formatLabelCurrency,
  labelHasActivePromo,
} from '../utils/priceLabelFormatters';

export default function PriceLabelCard({
  item,
  catalogProducts,
  comboItems,
  getPricedCatalogItem,
  resolveItemLocationPrices,
  logoSrc,
  stampSrc,
  companyName,
}) {
  if (!item) return <div className="label-card" />;
  const isProduct = item.type === 'product';
  const data = getPricedCatalogItem(item.type, item.id) || {};
  const priced = resolveItemLocationPrices(item);
  const components = item.type === 'set'
    ? (comboItems || []).filter((c) => matchesComboId(c.combo_id, item.id))
    : [];
  const oldPrice = priced.standard;
  const promoPrice = priced.promo;
  const printStandardOnly = Boolean(item.printStandardOnly);
  const hasPromo = !printStandardOnly && labelHasActivePromo(oldPrice, promoPrice);
  const imageQrValue = buildLabelImageQrValue(item, data);

  return (
    <div className="label-card">
      <div className="label-watermark"><img src={logoSrc} alt="wm" onError={brandLogoOnError} /></div>
      <div className="label-header">
        <img src={logoSrc} className="header-logo" alt="logo" onError={brandLogoOnError} />
        <div className="header-company">{companyName || 'Best Rest Furniture'}</div>
        <img src={logoSrc} className="header-logo" alt="logo" onError={brandLogoOnError} />
      </div>

      <div className="label-name">
        <span className="label-name-label">Product Name:</span>
        <span className="label-name-value">{isProduct ? data.name : data.combo_name}</span>
      </div>

      {components.length > 0 ? (
        <ul className="label-components">
          {components.map((c) => {
            const prod = (catalogProducts || []).find((p) => String(p.id) === String(c.product_id)) || {};
            return (
              <li key={`${String(c.product_id)}-${c.quantity}`}>{prod.name || c.product_id} x{c.quantity}</li>
            );
          })}
        </ul>
      ) : null}

      <div className="label-stamp">
        <img src={stampSrc} alt="stamp" />
      </div>

      <div className="label-bl">
        <div className="label-qr" aria-label="Product code QR">
          <QRCodeCanvas value={(isProduct ? data.sku : data.sku) || ''} size={98} level="M" includeMargin />
        </div>
        <div className="label-sku">
          <span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}
        </div>
      </div>

      <div className="label-br">
        {hasPromo ? (
          <div className="price-old price-old-labeled">
            <span className="price-old-label">Old Price:</span>{' '}
            <span className="price-old-amount diagonal">{formatLabelCurrency(oldPrice)}</span>
          </div>
        ) : null}

        {imageQrValue ? (
          <div className="label-photo-qr-block">
            <div className="label-qr label-qr--photo" aria-label="Scan to view product photo">
              <QRCodeCanvas value={imageQrValue} size={98} level="M" includeMargin />
            </div>
            <div className="label-photo-qr-caption">Product photo</div>
          </div>
        ) : null}

        {hasPromo ? (
          <div className="price-now promo">
            <span className="price-now-label">PROMO PRICE:</span> {formatLabelCurrency(promoPrice)}!
          </div>
        ) : (
          <div className="price-now">
            <span className="price-now-label">Price:</span> {formatLabelCurrency(oldPrice)}
          </div>
        )}
      </div>
    </div>
  );
}