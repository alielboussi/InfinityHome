import CreateScreen from '../productionKiosk/screens/CreateScreen';

/** New carpentry products → Warehouse Floor 2 WIP (with photo), not Floor 1. */
export default function CarpentryCreateScreen(props) {
  return <CreateScreen {...props} presetGroup="carpentry" inventoryTarget="floor2" />;
}
