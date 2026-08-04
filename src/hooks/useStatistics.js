import { useEffect, useState } from 'react';
import db from '../dataClient';
import { fromPublic } from '../dbSchema';
import { fetchCanonicalFinancials } from '../utils/financials';

// Shared statistics hook: computes sales by currency, most/least sold product,
// layby dues by currency, and total customers. Accepts optional filters.
export default function useStatistics({ dateFrom = '', dateTo = '', locationFilter = '' } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    salesByCurrency: {},
    mostSoldProduct: '',
    leastSoldProduct: '',
    laybyByCurrency: {},
    dueK: 0,
    due$: 0,
    dueUSD: 0,
    totalCustomers: 0,
  });
  const [debug, setDebug] = useState({
    salesData: [],
    salesItemsData: [],
    productsData: [],
    laybyData: [],
    customersData: [],
    saleIds: [],
    filteredSales: [],
    productSales: {},
    prodMap: {},
  });

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError('');
      try {
        // 0) Locations map for name->id resolution
        const { data: locData } = await db.from('locations').select('id, name');
        const locationMap = {};
        (locData || []).forEach(l => { locationMap[l.id] = l.name; });

        const resolveLocId = (filter) => {
          if (!filter) return '';
          // If numeric-ish assume it's an id, else try match name
          if (!isNaN(Number(filter))) return filter;
          const match = Object.keys(locationMap).find(id => (locationMap[id] || '').toLowerCase() === String(filter).toLowerCase());
          return match || filter;
        };
        const locId = resolveLocId(locationFilter);

        // 1) Total Sales (with currency)
  let salesQuery = fromPublic('sales').select('id, total_amount, sale_date, location_id, currency');
        if (dateFrom) salesQuery = salesQuery.gte('sale_date', dateFrom);
        if (dateTo) salesQuery = salesQuery.lte('sale_date', dateTo);
        if (locId) salesQuery = salesQuery.eq('location_id', locId);
        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;
        const salesByCurrency = {};
        (salesData || []).forEach(s => {
          const cur = s.currency || '';
          salesByCurrency[cur] = (salesByCurrency[cur] || 0) + ((Number(s.total_amount) || 0));
        });

        // 2) Most/Least Sold Product (filter by date/location)
        const allSales = salesData || [];
        let filteredSales = allSales;
        // Already filtered by query above
        const saleIds = filteredSales.map(s => s.id);
        let itemsData = [];
        if (saleIds.length > 0) {
          const { data: items, error: itemsError } = await db
            .from('sales_items')
            .select('product_id, quantity, sale_id')
            .in('sale_id', saleIds);
          if (itemsError) throw itemsError;
          itemsData = items;
        }
        const productSales = {};
        (itemsData || []).forEach(item => {
          if (!item?.product_id) return;
          productSales[item.product_id] = (productSales[item.product_id] || 0) + (Number(item.quantity) || 0);
        });
        let mostSoldProduct = '', leastSoldProduct = '';
        let prodMap = {};
        if (Object.keys(productSales).length > 0) {
          const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
          const prodIds = sorted
            .map(([id]) => id)
            .filter(id => !!id && String(id).toLowerCase() !== 'null' && String(id).toLowerCase() !== 'undefined');
          if (prodIds.length) {
            const { data: prodData, error: prodError } = await db
              .from('products')
              .select('id, name')
              .in('id', prodIds);
            if (prodError) throw prodError;
            (prodData || []).forEach(p => { prodMap[p.id] = p.name; });
            const safeSorted = sorted.filter(([id]) => prodMap[id]);
            if (safeSorted.length) {
              mostSoldProduct = prodMap[safeSorted[0][0]] || '';
              leastSoldProduct = prodMap[safeSorted[safeSorted.length - 1][0]] || '';
            }
          }
        }

        // 3) Lay-By dues by currency from base-table financials
        let laybyData = [];
        if ((salesData || []).length) {
          const saleIdsForLocation = (salesData || []).map(s => s.id);
          const { data: laybyRows, error: laybyError } = await db
            .from('laybys')
            .select('id, sale_id')
            .in('sale_id', saleIdsForLocation);
          if (laybyError) throw laybyError;
          laybyData = laybyRows || [];
        }
        const laybyByCurrency = {};
        const saleIdsForLayby = Array.from(new Set((laybyData || []).map(l => l.sale_id).filter(v => v != null)));
        let dueK = 0;
        let due$ = 0;
        if (saleIdsForLayby.length) {
          const finMap = await fetchCanonicalFinancials(db, saleIdsForLayby);
          finMap.forEach((fin) => {
            const curRaw = fin.currency || 'K';
            const cur = (curRaw === '$' || (curRaw || '').toUpperCase() === 'USD') ? 'USD' : 'K';
            const due = Math.max(0, Number(fin.outstanding_amount || 0));
            laybyByCurrency[cur] = (laybyByCurrency[cur] || 0) + due;
            if (cur === 'K') dueK += due;
            else if (cur === 'USD') due$ += due;
          });
        }

        // 4) Total Customers
        const { data: custData, error: custError } = await db.from('customers').select('id');
        if (custError) throw custError;
        const totalCustomers = (custData || []).length;

        // Products for debug only
        const { data: productsData } = await db.from('products').select('id, name');

  setStats({ salesByCurrency, mostSoldProduct, leastSoldProduct, laybyByCurrency, dueK, due$, dueUSD: due$, totalCustomers });
        setDebug({
          salesData: salesData || [],
          salesItemsData: itemsData || [],
          productsData: productsData || [],
          laybyData: laybyData || [],
          customersData: custData || [],
          saleIds,
          filteredSales,
          productSales,
          prodMap,
        });
      } catch (err) {
        setError('Failed to fetch statistics.');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, locationFilter]);

  return { loading, error, stats, debug };
}
