import React from 'react';
import { useParams } from 'react-router-dom';
import { isUserUuid } from './accessControl';
import StocktakeCountLegacyRedirect from './StocktakeCountLegacyRedirect';
import StocktakeCountSessionPage from './StocktakeCountSessionPage';

export default function StocktakeCountRoute() {
  const { locationSlug } = useParams();
  if (isUserUuid(locationSlug)) {
    return <StocktakeCountLegacyRedirect />;
  }
  return <StocktakeCountSessionPage locationSlug={locationSlug} />;
}
