import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isUserUuid } from './accessControl';
import { fetchLocations, getEvent } from './services/stocktake';
import { stocktakeCountPathForLocation } from './utils/stocktakeLocationSlug';

/** Old bookmarks used /stocktake/count/:eventId — send counters to the location URL. */
export default function StocktakeCountLegacyRedirect() {
  const { locationSlug } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isUserUuid(locationSlug)) return;
    let active = true;

    (async () => {
      try {
        const [eventData, locData] = await Promise.all([
          getEvent(locationSlug),
          fetchLocations(),
        ]);
        const loc = (locData.rows || []).find((row) => row.id === eventData.event?.location_id);
        if (!active) return;
        if (loc) {
          navigate(stocktakeCountPathForLocation(loc), { replace: true });
          return;
        }
      } catch {
        // fall through
      }
      if (active) navigate('/login', { replace: true });
    })();

    return () => {
      active = false;
    };
  }, [locationSlug, navigate]);

  if (!isUserUuid(locationSlug)) return null;

  return (
    <div className="stc-page stc-login">
      <div className="stc-card">
        <p className="stc-note">Redirecting to your location count page…</p>
      </div>
    </div>
  );
}
