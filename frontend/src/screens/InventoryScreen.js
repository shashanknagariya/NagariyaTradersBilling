import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLanguage } from '../context/LanguageContext';

const InventoryScreen = () => {
    const navigation = useNavigation();
    const { t } = useLanguage();
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedGrain, setExpandedGrain] = useState(null);

    useFocusEffect(
        React.useCallback(() => {
            fetchInventory();
        }, [])
    );

    const fetchInventory = async () => {
        try {
            const res = await client.get('/inventory/');
            setInventory(res.data);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to fetch inventory");
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id) => {
        setExpandedGrain(expandedGrain === id ? null : id);
    };

    const generateReport = async () => {
        const rows = inventory.map((item, index) => {
            const whRows = item.warehouses.map(w => `${w.name}: ${w.bags} Bags`).join('<br/>');
            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.grain_name}</td>
                    <td>${item.total_bags}</td>
                    <td>${item.total_quintal.toFixed(2)}</td>
                    <td>${item.average_price.toFixed(2)}</td>
                    <td>${whRows}</td>
                </tr>
            `;
        }).join('');

        const html = `
            <html>
                <head>
                    <style>
                        body { font-family: Helvetica; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid black; padding: 8px; text-align: left; }
                        th { background-color: #f0f0f0; }
                    </style>
                </head>
                <body>
                    <h2>Current Inventory Report</h2>
                    <p>Generated on: ${new Date().toLocaleDateString()}</p>
                    <table>
                        <tr>
                            <th>SN</th>
                            <th>Grain</th>
                            <th>Total Bags</th>
                            <th>Total Qtl</th>
                            <th>Avg Price (Rs/Qtl)</th>
                            <th>Warehouse Breakdown</th>
                        </tr>
                        ${rows}
                    </table>
                </body>
            </html>
        `;

        try {
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } catch (e) {
            Alert.alert("Error", "Failed to generate report");
        }
    };

    if (loading) return <ActivityIndicator size="large" className="mt-20" />;

    return (
        <View className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-6 px-6 rounded-b-3xl shadow-lg z-20 mb-4 flex-row justify-between items-center">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                        <Text className="text-white text-2xl">←</Text>
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-white">{t('inventory')}</Text>
                </View>
                <TouchableOpacity onPress={generateReport} className="bg-brand-gold px-3 py-2 rounded-lg">
                    <Text className="font-bold text-brand-navy">Download PDF</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={inventory}
                keyExtractor={item => item.grain_id.toString()}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                    <View className="bg-white rounded-xl mb-4 shadow-sm border border-gray-100 overflow-hidden">
                        <TouchableOpacity
                            className="p-4 flex-row justify-between items-center bg-gray-50 border-b border-gray-100"
                            onPress={() => toggleExpand(item.grain_id)}
                        >
                            <View>
                                <Text className="text-xl font-bold text-brand-navy">{item.grain_name}</Text>
                                <Text className="text-gray-500 text-xs">{t('avgPrice')}: ₹ {item.average_price.toFixed(2)}/Qtl</Text>
                            </View>
                            <View className="items-end">
                                <Text className="text-2xl font-bold text-green-700">{item.total_bags} <Text className="text-sm font-normal text-gray-500">{t('bags')}</Text></Text>
                                <Text className="text-xs text-gray-400">{item.total_quintal.toFixed(2)} Qtl</Text>
                            </View>
                        </TouchableOpacity>

                        {expandedGrain === item.grain_id && (
                            <View className="p-4 bg-white">
                                <Text className="font-bold text-gray-600 mb-2 text-xs uppercase tracking-widest">{t('storageLocation')}</Text>
                                {item.warehouses.map(wh => (
                                    <View key={wh.id} className="flex-row justify-between py-2 border-b border-gray-50 last:border-0">
                                        <Text className="text-gray-700">{wh.name}</Text>
                                        <Text className="font-semibold text-gray-900">{wh.bags} {t('bags')} ({wh.quintal.toFixed(2)} Qtl)</Text>
                                    </View>
                                ))}
                                {item.warehouses.length === 0 && <Text className="text-gray-400 italic">No stock in warehouses</Text>}
                            </View>
                        )}
                    </View>
                )}
                ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">Inventory is empty</Text>}
            />
        </View>
    );
};

export default InventoryScreen;
