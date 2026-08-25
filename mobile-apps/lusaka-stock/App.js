import { StatusBar } from 'expo-status-bar';
import FirebaseAuthGate from '../shared/AuthGate';
import StockScreen from './screens/StockScreen';

export default function App() {
  return (
    <FirebaseAuthGate title="Lusaka Stock" showUserBar={false} staySignedIn>
      <StatusBar style="light" />
      <StockScreen />
    </FirebaseAuthGate>
  );
}
