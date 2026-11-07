import React from 'react';
import { Navigate } from 'react-router-dom';
import BackToDashboard from '../BackToDashboard';
import PortalHubBar from '../components/PortalHubBar';
import { usePortalHubView } from '../hooks/usePortalHubView';
import { useReportHubFilters } from '../hooks/useReportHubFilters';
import SalesReport from '../SalesReport';
import TransfersReport from '../TransfersReport';
import ProductionReport from '../ProductionReport';
import CarpentryProductionReportPage from '../CarpentryProductionReportPage';
import PaintingReportPage from '../PaintingReportPage';
import RepairReportPage from '../RepairReportPage';
import StockHistoryPage from '../StockHistoryPage';
import { canManageCatalog, getCurrentUser } from '../accessControl';

const REPORT_OPTIONS = [
  { value: 'sales', label: 'Sales report' },
  { value: 'transfers', label: 'Transfers report' },
  { value: 'stock-history', label: 'Stock history' },
  { value: 'upholstery', label: 'Upholstery production' },
  { value: 'carpentry', label: 'Carpentry production' },
  { value: 'painting', label: 'Painting jobs' },
  { value: 'repair', label: 'Repair / returns' },
];

const CATALOG_REPORTS = new Set(['upholstery', 'carpentry', 'painting', 'repair']);

export default function ReportsHubPage() {
  const [report, setReport] = usePortalHubView('report', REPORT_OPTIONS, 'sales');
  const {
    startDate,
    endDate,
    userFilter,
    customerFilter,
    setStartDate,
    setEndDate,
    setUserFilter,
    setCustomerFilter,
  } = useReportHubFilters();
  const canViewCatalogReports = canManageCatalog(getCurrentUser());

  if (CATALOG_REPORTS.has(report) && !canViewCatalogReports) {
    return <Navigate to="/reports?report=sales" replace />;
  }

  let body = null;
  switch (report) {
    case 'sales':
      body = <SalesReport embedInHub userFilter={userFilter} />;
      break;
    case 'transfers':
      body = <TransfersReport embedInHub userFilter={userFilter} />;
      break;
    case 'upholstery':
      body = <ProductionReport embedInHub userFilter={userFilter} />;
      break;
    case 'carpentry':
      body = <CarpentryProductionReportPage embedInHub userFilter={userFilter} />;
      break;
    case 'painting':
      body = <PaintingReportPage embedInHub userFilter={userFilter} />;
      break;
    case 'repair':
      body = <RepairReportPage embedInHub userFilter={userFilter} />;
      break;
    case 'stock-history':
      body = (
        <StockHistoryPage
          embedInHub
          startDate={startDate}
          endDate={endDate}
          customerFilter={customerFilter}
        />
      );
      break;
    default:
      return <Navigate to="/reports?report=sales" replace />;
  }

  const showUserFilter = report !== 'sales' && report !== 'stock-history';
  const showCustomerFilter = report === 'stock-history';

  return (
    <div className="portal-hub-page portal-hub-page--reports">
      <div className="portal-hub-page__chrome page-header-row">
        <BackToDashboard />
        <PortalHubBar
          title="Reports"
          viewLabel="Report"
          viewValue={report}
          viewOptions={REPORT_OPTIONS.filter((opt) => (
            CATALOG_REPORTS.has(opt.value) ? canViewCatalogReports : true
          ))}
          onViewChange={setReport}
        >
          <div className="portal-hub-report-filters report-filters">
            <div className="report-filter-block">
              <label htmlFor="hub-start-date">Start date</label>
              <input
                id="hub-start-date"
                type="date"
                className="pos-control"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="report-filter-block">
              <label htmlFor="hub-end-date">End date</label>
              <input
                id="hub-end-date"
                type="date"
                className="pos-control"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {showUserFilter ? (
              <div className="report-filter-block">
                <label htmlFor="hub-user-filter">User (contains)</label>
                <input
                  id="hub-user-filter"
                  type="search"
                  className="pos-control"
                  placeholder="Filter by name"
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                />
              </div>
            ) : null}
            {showCustomerFilter ? (
              <div className="report-filter-block">
                <label htmlFor="hub-customer-filter">Customer (contains)</label>
                <input
                  id="hub-customer-filter"
                  type="search"
                  className="pos-control"
                  placeholder="Filter history rows by customer"
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </PortalHubBar>
      </div>
      {body}
    </div>
  );
}
