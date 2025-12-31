import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { useLanguage } from '../context/LanguageContext';

const HomeScreen = () => {
    const navigation = useNavigation();
    const { logout, userInfo } = useAuth();
    const { t, language, switchLanguage } = useLanguage();

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
        Alert.alert(t('logout'), "Are you sure?", [
            { text: t('cancel'), style: "cancel" },
            { text: t('logout'), onPress: logout }
        ]);
    };

    return (
        <ScrollView className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-8 px-6 rounded-b-3xl shadow-lg z-20 mb-6 flex-row justify-between items-start">
                <View>
                    <Text className="text-2xl font-bold text-white mb-1">{t('dashboard')}</Text>
                    <Text className="text-gray-300 text-sm">{t('welcome')}, {userInfo?.username} ({userInfo?.role})</Text>
                </View>
                <View className="flex-row items-center">
                    <TouchableOpacity
                        onPress={() => switchLanguage(language === 'en' ? 'hi' : 'en')}
                        className="bg-white/20 px-3 py-1 rounded-full border border-white/20 mr-2"
                    >
                        <Text className="text-white text-xs font-bold">{language === 'en' ? 'HI' : 'EN'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleLogout} className="bg-white/10 px-3 py-1 rounded-full border border-white/20">
                        <Text className="text-white text-xs font-bold">{t('logout')}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View className="px-6 pb-6">
                {/* Stats Row - Admin Only */}
                {isAdmin && (
                    <>
                        <Text className="font-bold text-gray-700 mb-3 uppercase tracking-widest text-xs">{t('financialOverview')}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 -mx-2">
                            <StatCard label={t('toReceive')} value={`₹ ${(stats.total_receivable || 0).toFixed(2)}`} color="bg-emerald-500" />
                            <StatCard label={t('toPay')} value={`₹ ${(stats.total_payable || 0).toFixed(2)}`} color="bg-rose-500" />
                            <StatCard label={t('inventoryValue')} value={`₹ ${(stats.total_inventory_value || 0).toFixed(2)}`} color="bg-indigo-500" />
                        </ScrollView>
                    </>
                )}

                {/* Modules Grid */}
                <Text className="font-bold text-gray-700 mb-3 uppercase tracking-widest text-xs">{t('quickActions')}</Text>
                <View className="flex-row flex-wrap justify-between">
                    {hasAccess('purchase') && (
                        <ModuleCard title={t('purchase')} icon="🛒" color="bg-white" onPress={() => navigation.navigate('Purchase')} />
                    )}
                    {hasAccess('sale') && (
                        <ModuleCard title={t('newSale')} icon="📈" color="bg-white" onPress={() => navigation.navigate('Sales')} />
                    )}
                    {hasAccess('inventory') && (
                        <ModuleCard title={t('inventory')} icon="📦" color="bg-white" onPress={() => navigation.navigate('Inventory')} />
                    )}
                    {hasAccess('reports') && (
                        <ModuleCard title={t('reports')} icon="📄" color="bg-white" onPress={() => navigation.navigate('Reports')} />
                    )}
                    {isAdmin && (
                        <ModuleCard title={t('users')} icon="👥" color="bg-white" onPress={() => navigation.navigate('UserManagement')} />
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
