import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import "./global.css"

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import PurchaseScreen from './src/screens/PurchaseScreen';
import SalesScreen from './src/screens/SalesScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import BillViewScreen from './src/screens/BillViewScreen';
import EditTransactionScreen from './src/screens/EditTransactionScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';

const Stack = createStackNavigator();

const AppNav = () => {
  const { userToken } = useAuth();

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Purchase" component={PurchaseScreen} />
            <Stack.Screen name="Sales" component={SalesScreen} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
            <Stack.Screen name="BillView" component={BillViewScreen} />
            <Stack.Screen name="EditTransaction" component={EditTransactionScreen} />
            <Stack.Screen name="UserManagement" component={UserManagementScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppNav />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
