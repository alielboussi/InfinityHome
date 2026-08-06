import Ionicons from '@expo/vector-icons/Ionicons';

const TAB_ICONS = {
  Dashboard: { active: 'grid', inactive: 'grid-outline' },
  Customers: { active: 'people', inactive: 'people-outline' },
  Products: { active: 'pricetags', inactive: 'pricetags-outline' },
  Sales: { active: 'receipt', inactive: 'receipt-outline' },
};

export function getTabBarIcon(routeName) {
  const icons = TAB_ICONS[routeName] || TAB_ICONS.Dashboard;
  return ({ focused, color, size }) => (
    <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />
  );
}
