import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import db from '../dataClient';
import PriceLabelCard from './PriceLabelCard';
import {
  applyComboLocationPricing,
  applyProductLocationPricing,
  buildComboLocationPriceMap,
  buildProductLocationPriceMap,
} from '../utils/locationPricing';
import {
  fetchComboLocationPrices,
  fetchProductLocationPrices,
} from '../services/locationPricing';
import { preloadBrandAssets, STATIC_BRAND_LOGO, STATIC_BRAND_STAMP } from '../utils/brandAssets';
import { buildLabelPairsFromSelection } from '../utils/priceLabelFormatters';
import {
  printPriceLabelsWithFilename,
  sendPriceLabelsWhatsAppBatch,
} from '../utils/priceLabelPdfBatch';
import { normalizeLabelQty } from '../utils/priceLabelFormatters';

/**
 * Off-screen A4 price labels (same DOM/CSS as /price-labels). Runs print or WhatsApp once ready.
 * batch: { locationId, locationName, items, action: 'print' | 'whatsapp' }
 */
export default function PriceLabelA4BatchHost({ batch, onComplete, onError }) {
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogCombos, setCatalogCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [productLocationPrices, setProductLocationPrices] = useState([]);
  const [comboLocationPrices, setComboLocationPrices] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });
  const [logoSrc, setLogoSrc] = useState(STATIC_BRAND_LOGO);
  const [stampSrc, setStampSrc] = useState(STATIC_BRAND_STAMP);
  const [assetsReady, setAssetsReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const sendRenderRef = useRef(null);
  const ranRef = useRef(false);

  const productLocationPriceMap = useMemo(
    () => buildProductLocationPriceMap(productLocationPrices),
    [productLocationPrices],
  );
  const comboLocationPriceMap = useMemo(
    () => buildComboLocationPriceMap(comboLocationPrices),
    [comboLocationPrices],
  );

  const pricingLocationId = useMemo(
    () => String(batch?.locationId || '').trim(),
    [batch?.locationId],
  );

  const selectedInAddOrder = useMemo(
    () => [...(batch?.items || [])].sort((a, b) => (
      (a.addedOrder || 0) - (b.addedOrder || 0)
    )),
    [batch?.items],
  );

  const getPricedCatalogItem = useCallback((type, id) => {
    if (!id) return null;
    if (type === 'product') {
      const row = (catalogProducts || []).find((product) => String(product.id) === String(id));
      if (!row) return null;
      if (!pricingLocationId) return row;
      return applyProductLocationPricing(row, pricingLocationId, productLocationPriceMap);
    }
    const row = (catalogCombos || []).find((combo) => String(combo.id) === String(id));
    if (!row) return null;
    if (!pricingLocationId) return row;
    return applyComboLocationPricing(row, pricingLocationId, comboLocationPriceMap);
  }, [
    catalogCombos,
    catalogProducts,
    comboLocationPriceMap,
    pricingLocationId,
    productLocationPriceMap,
  ]);

  const resolveItemLocationPrices = useCallback((item) => {
    const priced = getPricedCatalogItem(item?.type, item?.id) || {};
    if (item?.type === 'product') {
      return {
        standard: priced.price,
        promo: priced.promotional_price,
        currency: priced.currency,
      };
    }
    return {
      standard: priced.combo_price ?? priced.standard_price,
      promo: priced.promotional_price,
      currency: priced.currency,
    };
  }, [getPricedCatalogItem]);

  const { pairs } = useMemo(
    () => buildLabelPairsFromSelection(selectedInAddOrder),
    [selectedInAddOrder],
  );

  useEffect(() => {
    if (!batch?.items?.length) {
      setDataReady(false);
      return undefined;
    }
    let cancelled = false;
    ranRef.current = false;
    setDataReady(false);

    (async () => {
      try {
        const productIds = [...new Set(
          batch.items.filter((i) => i.type === 'product').map((i) => String(i.id)),
        )];
        const comboIds = [...new Set(
          batch.items.filter((i) => i.type === 'set').map((i) => String(i.id)),
        )];

        const productFetches = productIds.length
          ? db.from('products').select('*').in('id', productIds)
          : Promise.resolve({ data: [] });
        const comboFetches = comboIds.length
          ? db.from('combos').select('*').in('id', comboIds)
          : Promise.resolve({ data: [] });

        const [
          { data: productsData },
          { data: combosData },
          productLocationPriceRows,
          comboLocationPriceRows,
        ] = await Promise.all([
          productFetches,
          comboFetches,
          fetchProductLocationPrices(db),
          fetchComboLocationPrices(db),
        ]);
        if (cancelled) return;

        const imageProductIds = productIds.slice();
        let imagesByProduct = new Map();
        if (imageProductIds.length) {
          const { data: productImagesData } = await db
            .from('product_images')
            .select('product_id, image_url')
            .in('product_id', imageProductIds);
          if (cancelled) return;
          imagesByProduct = new Map();
          (productImagesData || []).forEach((row) => {
            const pid = String(row?.product_id || '');
            if (!pid) return;
            if (!imagesByProduct.has(pid)) imagesByProduct.set(pid, []);
            imagesByProduct.get(pid).push({ image_url: row.image_url });
          });
        }

        let nextProducts = (productsData || []).map((product) => ({
          ...product,
          product_images: imagesByProduct.get(String(product.id)) || product.product_images || [],
        }));

        setCatalogCombos(combosData || []);
        setProductLocationPrices(productLocationPriceRows || []);
        setComboLocationPrices(comboLocationPriceRows || []);

        const comboIdsForItems = (combosData || []).map((c) => c.id);
        let nextComboItems = [];
        if (comboIdsForItems.length) {
          const { data: ci } = await db.from('combo_items').select('*').in('combo_id', comboIdsForItems);
          if (cancelled) return;
          nextComboItems = ci || [];
        }
        setComboItems(nextComboItems);

        const componentProductIds = [
          ...new Set(nextComboItems.map((c) => String(c.product_id || '')).filter(Boolean)),
        ];
        const haveIds = new Set(nextProducts.map((p) => String(p.id)));
        const missingIds = componentProductIds.filter((id) => !haveIds.has(id));
        if (missingIds.length) {
          const { data: extraProducts } = await db.from('products').select('*').in('id', missingIds);
          if (cancelled) return;
          const { data: extraImages } = await db
            .from('product_images')
            .select('product_id, image_url')
            .in('product_id', missingIds);
          if (cancelled) return;
          (extraImages || []).forEach((row) => {
            const pid = String(row?.product_id || '');
            if (!pid) return;
            if (!imagesByProduct.has(pid)) imagesByProduct.set(pid, []);
            imagesByProduct.get(pid).push({ image_url: row.image_url });
          });
          (extraProducts || []).forEach((p) => {
            if (!haveIds.has(String(p.id))) {
              nextProducts.push({
                ...p,
                product_images: imagesByProduct.get(String(p.id)) || p.product_images || [],
              });
            }
          });
        }
        setCatalogProducts(nextProducts);

        const { data: companyData } = await db
          .from('company_settings')
          .select('company_name, company_logo')
          .maybeSingle();
        if (cancelled) return;
        setCompany(companyData?.company_name
          ? { name: companyData.company_name }
          : { name: 'Best Rest Furniture' });

        const brandAssets = await preloadBrandAssets({ includeStamp: true });
        if (cancelled) return;
        setLogoSrc(brandAssets.logoSrc || STATIC_BRAND_LOGO);
        setStampSrc(brandAssets.stampSrc || STATIC_BRAND_STAMP);
        setAssetsReady(true);
        setDataReady(true);
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    })();

    return () => { cancelled = true; };
  }, [batch, onError]);

  useEffect(() => {
    if (!batch || !dataReady || !assetsReady || ranRef.current) return undefined;
    if (!pairs.length) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || ranRef.current) return;
      ranRef.current = true;
      const locationName = batch.locationName || 'Kitwe';
      const getItemDisplayName = (item) => {
        const priced = getPricedCatalogItem(item.type, item.id);
        return item.type === 'product' ? priced?.name : priced?.combo_name;
      };
      const labelSummary = selectedInAddOrder.map((item) => {
        const name = getItemDisplayName(item) || item.type;
        return `${name} x${normalizeLabelQty(item.qty)}`;
      }).join('; ');

      try {
        if (batch.action === 'whatsapp') {
          await sendPriceLabelsWhatsAppBatch({
            sendRenderRef,
            locationName,
            selectedInAddOrder,
            getItemDisplayName,
          });
          if (!cancelled) {
            alert('Sent to the Price Labels WhatsApp group.');
            onComplete?.();
          }
        } else {
          printPriceLabelsWithFilename({
            locationName,
            selectedCount: selectedInAddOrder.length,
            labelSummary,
            showExportHint: true,
          });
          if (!cancelled) onComplete?.();
        }
      } catch (err) {
        if (!cancelled) onError?.(err);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    assetsReady,
    batch,
    dataReady,
    getPricedCatalogItem,
    onComplete,
    onError,
    pairs.length,
    selectedInAddOrder,
  ]);

  if (!batch?.items?.length || !dataReady) return null;

  const cardProps = {
    catalogProducts,
    comboItems,
    getPricedCatalogItem,
    resolveItemLocationPrices,
    logoSrc,
    stampSrc,
    companyName: company.name,
  };

  return (
    <div className="price-labels-page kitwe-price-label-batch-host" aria-hidden>
      <div className="labels-a4">
        {pairs.map((pair, idx) => (
          <div className="a4-pair" key={`print-${idx}`}>
            <div className="a4-label"><PriceLabelCard item={pair[0]} {...cardProps} /></div>
            <div className="a4-label"><PriceLabelCard item={pair[1] || null} {...cardProps} /></div>
          </div>
        ))}
      </div>
      <section className="labels-a4 plm-hidden-render" ref={sendRenderRef} aria-hidden>
        {pairs.map((pair, idx) => (
          <div className="a4-pair" key={`send-${idx}`}>
            <div className="a4-label"><PriceLabelCard item={pair[0]} {...cardProps} /></div>
            <div className="a4-label"><PriceLabelCard item={pair[1] || null} {...cardProps} /></div>
          </div>
        ))}
      </section>
    </div>
  );
}