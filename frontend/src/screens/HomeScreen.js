import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const HomeScreen = () => {
    const navigation = useNavigation();
    const { logout, userInfo } = useAuth();
    const [stats, setStats] = useState({
        total_receivable: 0,
        total_payable: 0,
        total_inventory_value: 0
    });
    const [loading, setLoading] = useState(true);

    const isAdmin = userInfo?.role === 'admin';
    const perms = userInfo?.permissions || [];
    const hasAccess = (perm) => isAdmin || perms.includes(perm);

    useFocusEffect(
        React.useCallback(() => {
            if (isAdmin) fetchStats();
        }, [isAdmin])
    );

    const fetchStats = async () => {
        try {
            const res = await client.get('/stats/dashboard');
            setStats(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Logout", onPress: logout }
        ]);
    };

    return (
        <ScrollView className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-8 px-6 rounded-b-3xl shadow-lg z-20 mb-6 flex-row justify-between items-start">
                <View>
                    <Text className="text-2xl font-bold text-white mb-1">Dashboard</Text>
                    <Text className="text-gray-300 text-sm">Welcome, {userInfo?.username} ({userInfo?.role})</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} className="bg-white/10 px-3 py-1 rounded-full border border-white/20">
                    <Text className="text-white text-xs font-bold">LOGOUT</Text>
                </TouchableOpacity>
            </View>

            <View className="px-6 pb-6">
                {/* Stats Row - Admin Only */}
                {isAdmin && (
                    <>
                        <Text className="font-bold text-gray-700 mb-3 uppercase tracking-widest text-xs">Financial Overview</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 -mx-2">
                            <StatCard label="To Receive" value={`₹ ${(stats.total_receivable || 0).toFixed(2)}`} color="bg-emerald-500" />
                            <StatCard label="To Pay" value={`₹ ${(stats.total_payable || 0).toFixed(2)}`} color="bg-rose-500" />
                            <StatCard label="Inventory Value" value={`₹ ${(stats.total_inventory_value || 0).toFixed(2)}`} color="bg-indigo-500" />
                        </ScrollView>
                    </>
                )}

                {/* Modules Grid */}
                <Text className="font-bold text-gray-700 mb-3 uppercase tracking-widest text-xs">Quick Actions</Text>
                <View className="flex-row flex-wrap justify-between">
                    {hasAccess('purchase') && (
                        <ModuleCard title="Purchase" icon="🛒" color="bg-white" onPress={() => navigation.navigate('Purchase')} />
                    )}
                    {hasAccess('sale') && (
                        <ModuleCard title="New Sale" icon="📈" color="bg-white" onPress={() => navigation.navigate('Sales')} />
                    )}
                    {hasAccess('inventory') && (
                        <ModuleCard title="Inventory" icon="📦" color="bg-white" onPress={() => navigation.navigate('Inventory')} />
                    )}
                    {hasAccess('reports') && (
                        <ModuleCard title="Reports" icon="📄" color="bg-white" onPress={() => navigation.navigate('Reports')} />
                    )}
                    {isAdmin && (
                        <ModuleCard title="Users" icon="👥" color="bg-white" onPress={() => navigation.navigate('UserManagement')} />
                    )}
                </View>
            </View>
        </ScrollView>
    );
};

const StatCard = ({ label, value, color }) => (
    <View className={`${color} p-4 rounded-2xl w-40 mr-3 shadow-md items-start justify-between min-h-[100px]`}>
        <Text className="text-white/80 font-bold text-xs uppercase">{label}</Text>
        <Text className="text-white font-bold text-lg">{value}</Text>
    </View>
);

const ModuleCard = ({ title, icon, color, onPress }) => (
    <TouchableOpacity
        className={`${color} w-[48%] p-6 rounded-2xl justify-center items-center mb-4 shadow-sm border border-gray-100 active:bg-gray-50`}
        onPress={onPress}
    >
        <Text className="text-4xl mb-2">{icon}</Text>
        <Text className="text-brand-navy font-bold text-lg">{title}</Text>
    </TouchableOpacity>
);

export default HomeScreen;
