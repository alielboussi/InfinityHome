import KitweSendHomeScreen from './KitweSendHomeScreen';

/** Floor 2 → Farm — same packet BOM flow as Floor 1 send (stock deducts from Floor 2). */
export default function FarmSendHomeScreen(props) {
  return <KitweSendHomeScreen {...props} deliveryFlow="farm" />;
}
