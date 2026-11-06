/**
 * After saving a warehouse catalog form, return to a list screen without leaving
 * the form on the back stack (navigate() would push another copy on top).
 */
export function returnToCatalogListScreen(navigation, screenName) {
  const params = screenName === 'WarehouseIncompleteProducts'
    ? { catalogMode: 'incomplete' }
    : screenName === 'WarehouseProducts'
      ? { catalogMode: 'complete' }
      : undefined;

  const state = navigation.getState?.();
  const routes = state?.routes || [];
  const index = typeof state?.index === 'number' ? state.index : routes.length - 1;
  const previous = index > 0 ? routes[index - 1] : null;

  if (previous?.name === screenName) {
    navigation.pop();
    return;
  }
  if (params) {
    navigation.replace(screenName, params);
  } else {
    navigation.replace(screenName);
  }
}
