import { useEffect } from 'react';

/** Legacy route — delivery is a single screen (KitweSendHome). */
export default function KitweSendProductScreen({ navigation }) {
  useEffect(() => {
    navigation.replace('KitweSendHome');
  }, [navigation]);
  return null;
}
