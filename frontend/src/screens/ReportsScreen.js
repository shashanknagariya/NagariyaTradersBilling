import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, Platform, ScrollView } from 'react-native';
import client from '../api/client';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const ReportsScreen = () => {
    const navigation = useNavigation();
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'analytics'
    const [transactions, setTransactions] = useState([]);
    const [grains, setGrains] = useState({});
    const [contacts, setContacts] = useState({});
    const [warehouses, setWarehouses] = useState({});
    const [loading, setLoading] = useState(true);

    // Filters & Search State
    const [filter, setFilter] = useState('all'); // Type: all, purchase, sale
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState('desc'); // asc, desc
    const [filterStatus, setFilterStatus] = useState('all'); // all, paid, pending, partial
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [isFilterModalVisible, setFilterModalVisible] = useState(false);

    const [groupBy, setGroupBy] = useState('none'); // none, grain, party
    const [analyticsStartDate, setAnalyticsStartDate] = useState('');
    const [analyticsEndDate, setAnalyticsEndDate] = useState('');
    const [reportType, setReportType] = useState('profit'); // profit, purchase, sale

    // Payment Modal State
    const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
    const [selectedTrx, setSelectedTrx] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');

    useFocusEffect(
        React.useCallback(() => {
            fetchData();
        }, [])
    );

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tRes, gRes, cRes, wRes] = await Promise.all([
                client.get('/transactions/'),
                client.get('/master/grains'),
                client.get('/master/contacts'),
                client.get('/master/warehouses')
            ]);

            const gMap = {}; gRes.data.forEach(g => gMap[g.id] = g.name);
            setGrains(gMap);

            const cMap = {}; cRes.data.forEach(c => cMap[c.id] = c.name);
            setContacts(cMap);

            const wMap = {}; wRes.data.forEach(w => wMap[w.id] = w.name);
            setWarehouses(wMap);

            setTransactions(tRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const reportData = useMemo(() => {
        if (viewMode !== 'analytics') return [];

        // Helper
        const getNetTotal = (t) => {
            if (t.type === 'purchase') return t.total_amount;
            // For sale, subtract deductions
            const shortageVal = (t.shortage_quantity || 0) * t.rate_per_quintal;
            const deduct = t.deduction_amount || 0;
            return t.total_amount - shortageVal - deduct;
        };

        // 1. Filter
        let data = transactions.filter(t => {
            if (reportType === 'profit' && t.type !== 'sale') return false;
            // ... (rest same)
            if (reportType === 'sale' && t.type !== 'sale') return false;
            if (reportType === 'purchase' && t.type !== 'purchase') return false;

            if (analyticsStartDate) {
                const s = new Date(analyticsStartDate); s.setHours(0, 0, 0, 0);
                if (new Date(t.date).getTime() < s.getTime()) return false;
            }
            if (analyticsEndDate) {
                const e = new Date(analyticsEndDate); e.setHours(23, 59, 59, 999);
                if (new Date(t.date).getTime() > e.getTime()) return false;
            }
            return true;
        });

        // 2. Map Extended Fields
        data = data.map(t => {
            const qty = t.quantity_quintal || 0;
            const rate = t.rate_per_quintal || 0;
            const bags = t.number_of_bags || 0;

            const baseAmount = qty * rate; // User requested: Just Qty * Rate

            // Costs
            const shortageCost = (t.shortage_quantity || 0) * rate;
            const deductionCost = t.deduction_amount || 0;
            const labourCostTotal = bags * (t.labour_cost_per_bag || 0);
            const transportCostTotal = qty * (t.transport_cost_per_qtl || 0);

            // Net Realized: Base - (Shortage + Deduction + Labour + Transport)
            const netRealized = baseAmount - shortageCost - deductionCost - labourCostTotal - transportCostTotal;

            // Profit (for profit report): Net Realized - Cost Price
            // (Note: This logic aligns profit with realized amount)
            const profit = (t.type === 'sale')
                ? netRealized - ((t.cost_price_per_quintal || 0) * qty)
                : 0;

            return {
                ...t,
                contactName: contacts[t.contact_id] || 'Unknown',
                grainName: grains[t.grain_id] || 'Unknown',
                warehouseName: warehouses[t.warehouse_id] || 'Unknown',
                baseAmount,
                shortageCost,
                deductionCost,
                labourCostTotal,
                transportCostTotal,
                netRealized,
                profit
            };
        });

        // 3. Grouping
        if (groupBy !== 'none') {
            const groups = {};
            data.forEach(t => {
                let groupKey = 'Unknown';
                if (groupBy === 'grain') groupKey = t.grainName;
                if (groupBy === 'party') groupKey = t.contactName;
                if (groupBy === 'warehouse') groupKey = t.warehouseName;

                if (!groups[groupKey]) {
                    groups[groupKey] = { name: groupKey, qty: 0, amount: 0, profit: 0, count: 0 };
                }
                groups[groupKey].qty += t.quantity_quintal;
                groups[groupKey].amount += t.netRealized; // Use Net Realized for grouped view
                groups[groupKey].profit += t.profit;
                groups[groupKey].count += 1;
            });
            return Object.values(groups);
        }

        return data; // Raw List
    }, [transactions, viewMode, reportType, analyticsStartDate, analyticsEndDate, groupBy, contacts, grains, warehouses]);

    const downloadCsv = async () => {
        if (reportData.length === 0) { Alert.alert("No Data"); return; }

        let headers = [];
        let rows = [];

        if (groupBy !== 'none') {
            headers = ['Group Name', 'Count', 'Total Qty', 'Total Amount', 'Total Profit'];
            rows = reportData.map(d => [d.name, d.count, d.qty.toFixed(2), d.amount.toFixed(2), d.profit.toFixed(2)]);
        } else {
            headers = ['Date', 'Invoice', 'Party', 'Grain', 'Bags', 'Qty', 'Rate', 'Gross(Q*R)', 'Shortage', 'Deduction', 'Labour', 'Transport', 'Net Realized'];
            if (reportType === 'profit') { headers.push('Avg Cost'); headers.push('Profit'); }

            rows = reportData.map(d => {
                let r = [
                    new Date(d.date).toLocaleDateString().replace(/,/g, ''),
                    d.invoice_number || '-',
                    `"${d.contactName}"`,
                    `"${d.grainName}"`,
                    (d.number_of_bags || 0).toString(),
                    d.quantity_quintal.toFixed(2),
                    d.rate_per_quintal.toFixed(2),
                    d.baseAmount.toFixed(2),
                    d.shortageCost.toFixed(2),
                    d.deductionCost.toFixed(2),
                    d.labourCostTotal.toFixed(2),
                    d.transportCostTotal.toFixed(2),
                    d.netRealized.toFixed(2)
                ];
                if (reportType === 'profit') {
                    r.push((d.cost_price_per_quintal || 0).toFixed(2));
                    r.push(d.profit.toFixed(2));
                }
                return r;
            });
        }

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        try {
            if (Platform.OS === 'web') {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                const fileUri = FileSystem.documentDirectory + `report_${reportType}_${Date.now()}.csv`;
                await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
                await Sharing.shareAsync(fileUri);
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to export CSV: " + e.message);
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            "Delete Transaction",
            "Are you sure? This will update inventory.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await client.delete(`/transactions/${id}`);
                            fetchData(); // Refresh
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete");
                        }
                    }
                }
            ]
        );
    };

    const openPaymentModal = (item) => {
        setSelectedTrx(item);
        setPaymentAmount('');
        setPaymentModalVisible(true);
    };

    const handlePaymentSubmit = async () => {
        if (!paymentAmount || isNaN(paymentAmount)) {
            Alert.alert("Error", "Enter valid amount");
            return;
        }

        const amount = parseFloat(paymentAmount);

        // Calculate Net Pending
        const shortageVal = (selectedTrx.shortage_quantity || 0) * selectedTrx.rate_per_quintal;
        const deduction = selectedTrx.deduction_amount || 0;
        const netTotal = selectedTrx.total_amount - shortageVal - deduction;
        const pending = netTotal - (selectedTrx.amount_paid || 0);

        if (amount <= 0) {
            Alert.alert("Error", "Amount must be positive");
            return;
        }

        if (amount > pending + 1.0) { // Small buffer for round off
            Alert.alert("Error", `Cannot pay more than pending amount (₹${pending.toFixed(2)})`);
            return;
        }

        if (amount > pending + 0.1) {
            Alert.alert("Error", `Cannot pay more than pending amount (₹${pending.toFixed(2)})`);
            return;
        }

        try {
            await client.post(`/transactions/${selectedTrx.id}/payment`, { amount });
            setPaymentModalVisible(false);
            fetchData();
            Alert.alert("Success", "Payment Recorded");
        } catch (e) {
            Alert.alert("Error", "Payment failed");
        }
    };

    const getStatusParams = (paid, total, type, shortage, deduction, rate) => {
        let effectiveTotal = total;
        if (type === 'sale') {
            const shortageVal = (shortage || 0) * (rate || 0);
            effectiveTotal = total - shortageVal - (deduction || 0);
        }

        const p = paid || 0;
        // If effectiveTotal is negative (loss/theft), and we paid 0, it's fully paid (settled).
        if (p >= effectiveTotal - 1.0) return { label: 'Fully Paid', color: 'bg-green-100 text-green-800' };
        if (p > 0) return { label: 'Partial', color: 'bg-yellow-100 text-yellow-800' };
        return { label: 'Pending', color: 'bg-red-100 text-red-800' };
    };

    const filteredTransactions = transactions
        .filter(t => {
            // 1. Type Filter
            if (filter !== 'all' && t.type !== filter) return false;

            // 2. Status Filter
            if (filterStatus !== 'all') {
                const p = t.amount_paid || 0;
                let effectiveTotal = t.total_amount;

                if (t.type === 'sale') {
                    const s = (t.shortage_quantity || 0) * (t.rate_per_quintal || 0);
                    effectiveTotal = t.total_amount - s - (t.deduction_amount || 0);
                }

                let status = 'pending';
                if (p >= effectiveTotal - 1.0) status = 'paid';
                else if (p > 0) status = 'partial';

                // User might want "paid" to include "fully paid"
                if (filterStatus === 'paid' && status !== 'paid') return false;
                if (filterStatus === 'pending' && status !== 'pending') return false;
                if (filterStatus === 'partial' && status !== 'partial') return false;
            }

            // 3. Date Filter
            if (filterStartDate) {
                const s = new Date(filterStartDate); s.setHours(0, 0, 0, 0);
                if (new Date(t.date).getTime() < s.getTime()) return false;
            }
            if (filterEndDate) {
                const e = new Date(filterEndDate); e.setHours(23, 59, 59, 999);
                if (new Date(t.date).getTime() > e.getTime()) return false;
            }

            // 4. Search Filter (Invoice OR Party)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const contactName = (contacts[t.contact_id] || '').toLowerCase();
                const inv = (t.invoice_number || '').toString();
                if (!contactName.includes(q) && !inv.includes(q)) return false;
            }

            return true;
        })
        .sort((a, b) => {
            const invA = a.invoice_number || 0;
            const invB = b.invoice_number || 0;
            return sortOrder === 'asc' ? invA - invB : invB - invA;
        });

    const renderItem = ({ item }) => {
        const isPurchase = item.type === 'purchase';
        const contactName = contacts[item.contact_id] || 'Unknown Contact';
        const grainName = grains[item.grain_id] || 'Unknown Grain';

        const status = getStatusParams(
            item.amount_paid,
            item.total_amount,
            item.type,
            item.shortage_quantity,
            item.deduction_amount,
            item.rate_per_quintal
        );

        return (
            <View className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BillView', { transactionId: item.id })}
                >
                    <View className="flex-row justify-between mb-2">
                        <View className="flex-row items-center">
                            <Text className={`font-bold text-xs uppercase px-2 py-1 rounded mr-2 ${isPurchase ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                {isPurchase ? 'PURCHASE' : 'SALE'}
                            </Text>
                            <Text className="font-bold text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded mr-2">
                                INV #{item.invoice_number || '-'}
                            </Text>
                            <Text className={`font-bold text-xs uppercase px-2 py-1 rounded ${status.color}`}>
                                {status.label}
                            </Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{new Date(item.date).toLocaleDateString()}</Text>
                    </View>

                    <View className="flex-row justify-between items-center mb-1">
                        <View>
                            <Text className="text-brand-navy font-bold text-lg">{contactName}</Text>
                            <Text className="text-gray-500 text-sm">{grainName}</Text>
                        </View>
                        <View className="items-end">
                            <Text className="text-brand-navy font-bold text-lg text-right">₹ {item.total_amount.toFixed(2)}</Text>
                            {/* Show Settled Amount if different */}
                            {(item.type === 'sale' && (item.shortage_quantity > 0 || item.deduction_amount > 0)) && (() => {
                                const shortageVal = (item.shortage_quantity || 0) * item.rate_per_quintal;
                                const net = item.total_amount - shortageVal - (item.deduction_amount || 0);
                                return (
                                    <Text className="text-orange-600 font-bold text-xs text-right">
                                        Settled: ₹ {net.toFixed(2)}
                                    </Text>
                                );
                            })()}
                        </View>
                    </View>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-500">{item.quantity_quintal} Qtl @ ₹{item.rate_per_quintal} | Bags: {item.number_of_bags || '-'}</Text>
                        <Text className="text-xs text-gray-400">Paid: ₹{(item.amount_paid || 0).toFixed(2)}</Text>
                    </View>
                </TouchableOpacity>

                {/* Actions */}
                <View className="flex-row mt-2 pt-2 border-t border-gray-100 justify-end space-x-2">
                    <TouchableOpacity
                        onPress={() => navigation.navigate('EditTransaction', { transactionId: item.id })}
                        className="bg-gray-100 px-3 py-2 rounded-lg"
                    >
                        <Text className="text-gray-600 font-bold text-xs">Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => handleDelete(item.id)}
                        className="bg-red-50 px-3 py-2 rounded-lg mx-2"
                    >
                        <Text className="text-red-600 font-bold text-xs">Delete</Text>
                    </TouchableOpacity>

                    {item.amount_paid < item.total_amount && (
                        <TouchableOpacity
                            onPress={() => openPaymentModal(item)}
                            className="bg-emerald-100 px-3 py-2 rounded-lg"
                        >
                            <Text className="text-emerald-700 font-bold text-xs">Pay / Receive</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-6 px-6 rounded-b-3xl shadow-lg z-20 mb-4">
                <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                            <Text className="text-white text-2xl">←</Text>
                        </TouchableOpacity>
                        <Text className="text-2xl font-bold text-white">Reports & Analysis</Text>
                    </View>
                </View>

                {/* View Mode Tabs */}
                <View className="flex-row bg-brand-navy-light/30 p-1 rounded-xl">
                    <TouchableOpacity
                        onPress={() => setViewMode('list')}
                        className={`flex-1 py-2 items-center rounded-lg ${viewMode === 'list' ? 'bg-white' : ''}`}
                    >
                        <Text className={`font-bold ${viewMode === 'list' ? 'text-brand-navy' : 'text-gray-300'}`}>Transactions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setViewMode('analytics')}
                        className={`flex-1 py-2 items-center rounded-lg ${viewMode === 'analytics' ? 'bg-white' : ''}`}
                    >
                        <Text className={`font-bold ${viewMode === 'analytics' ? 'text-brand-navy' : 'text-gray-300'}`}>Analytics</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {viewMode === 'list' ? (
                <>
                    <View className="flex-row items-center justify-between px-4 mb-4">
                        <View className="flex-row items-center flex-1 bg-white border border-gray-200 rounded-xl px-4 mr-2 shadow-sm">
                            <Text className="text-gray-400 mr-2 text-lg">🔍</Text>
                            <TextInput
                                className={`flex-1 py-3 text-brand-navy font-semibold text-lg ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                placeholder="Search..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Text className="text-gray-400 font-bold text-lg">✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <View className="flex-row space-x-2">
                            <TouchableOpacity
                                onPress={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                className="bg-brand-gold/20 p-3 rounded-xl justify-center"
                            >
                                <Text className="text-brand-navy font-bold">{sortOrder === 'asc' ? '⬆' : '⬇'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setFilterModalVisible(true)}
                                className={`p-3 rounded-xl justify-center ${filterStatus !== 'all' || filterStartDate || filterEndDate ? 'bg-brand-gold' : 'bg-brand-gold/20'}`}
                            >
                                <Text className={`font-bold ${filterStatus !== 'all' || filterStartDate || filterEndDate ? 'text-brand-navy' : 'text-brand-navy'}`}>Filter</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View className="flex-row px-4 mb-4">
                        {['all', 'purchase', 'sale'].map(type => (
                            <TouchableOpacity
                                key={type}
                                onPress={() => setFilter(type)}
                                className={`mr-2 px-4 py-2 rounded-full border ${filter === type ? 'bg-brand-navy border-brand-navy' : 'bg-white border-gray-300'}`}
                            >
                                <Text className={`font-bold capitalize ${filter === type ? 'text-white' : 'text-gray-600'}`}>{type}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color="#1e1b4b" className="mt-10" />
                    ) : (
                        <FlatList
                            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                            data={filteredTransactions}
                            keyExtractor={item => item.id.toString()}
                            renderItem={renderItem}
                            ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No records found matching filters</Text>}
                        />
                    )}
                </>
            ) : (
                <View className="flex-1 px-4">
                    {/* Analytics Config */}
                    <View className="bg-white p-4 rounded-xl shadow-sm mb-4">
                        <Text className="font-bold text-gray-700 mb-2">Report Type & Grouping</Text>
                        <View className="flex-row mb-4 flex-wrap">
                            {['profit', 'purchase', 'sale'].map(t => (
                                <TouchableOpacity
                                    key={t}
                                    onPress={() => setReportType(t)}
                                    className={`mr-2 mb-2 px-3 py-1 rounded-lg border ${reportType === t ? 'bg-brand-navy border-brand-navy' : 'bg-gray-50 border-gray-200'}`}
                                >
                                    <Text className={`capitalize font-bold ${reportType === t ? 'text-white' : 'text-gray-600'}`}>{t}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View className="flex-row mb-4 items-center">
                            <Text className="mr-2 text-gray-500">Group By:</Text>
                            {['none', 'grain', 'party', 'warehouse'].map(g => (
                                <TouchableOpacity
                                    key={g}
                                    onPress={() => setGroupBy(g)}
                                    className={`mr-2 px-2 py-1 rounded border ${groupBy === g ? 'bg-brand-gold border-brand-gold' : 'bg-gray-50 border-gray-200'}`}
                                >
                                    <Text className={`capitalize text-xs font-bold ${groupBy === g ? 'text-brand-navy' : 'text-gray-500'}`}>{g}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View className="flex-row space-x-2 mb-4">
                            <TextInput
                                className="flex-1 bg-gray-50 p-2 rounded border border-gray-200 text-xs"
                                placeholder="Start Date (YYYY-MM-DD)"
                                value={analyticsStartDate}
                                onChangeText={setAnalyticsStartDate}
                            />
                            <TextInput
                                className="flex-1 bg-gray-50 p-2 rounded border border-gray-200 text-xs"
                                placeholder="End Date (YYYY-MM-DD)"
                                value={analyticsEndDate}
                                onChangeText={setAnalyticsEndDate}
                            />
                        </View>

                        <TouchableOpacity onPress={downloadCsv} className="bg-green-600 p-3 rounded-lg flex-row justify-center items-center">
                            <Text className="text-white font-bold">📥 Download CSV Report</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Data Table */}
                    <ScrollView className="flex-1 bg-white rounded-xl shadow-sm mb-4">
                        <ScrollView horizontal>
                            <View className="p-4">
                                {/* Header */}
                                <View className="flex-row border-b border-gray-200 pb-2 mb-2">
                                    {groupBy !== 'none' ? (
                                        <>
                                            <Text className="font-bold w-32 text-gray-700">Group Name</Text>
                                            <Text className="font-bold w-20 text-right text-gray-700">Count</Text>
                                            <Text className="font-bold w-24 text-right text-gray-700">Total Qty</Text>
                                            <Text className="font-bold w-28 text-right text-gray-700">Total Amt</Text>
                                            <Text className="font-bold w-24 text-right text-gray-700">Total Profit</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text className="font-bold w-24 text-gray-700">Date</Text>
                                            <Text className="font-bold w-20 text-gray-700">Invoice</Text>
                                            <Text className="font-bold w-32 text-gray-700">Party</Text>
                                            <Text className="font-bold w-24 text-gray-700">Grain</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Bags</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Qty</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Rate</Text>
                                            <Text className="font-bold w-20 text-right text-gray-700">Gross</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Short</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Ded.</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Lab.</Text>
                                            <Text className="font-bold w-16 text-right text-gray-700">Trans.</Text>
                                            <Text className="font-bold w-24 text-right text-brand-navy">Net</Text>
                                            {reportType === 'profit' && (
                                                <>
                                                    <Text className="font-bold w-20 text-right text-gray-700">Avg Cost</Text>
                                                    <Text className="font-bold w-24 text-right text-gray-700">Profit</Text>
                                                </>
                                            )}
                                        </>
                                    )}
                                </View>

                                {/* Rows */}
                                {reportData.map((d, i) => (
                                    <View key={i} className="flex-row border-b border-gray-100 py-2">
                                        {groupBy !== 'none' ? (
                                            <>
                                                <Text className="w-32 text-brand-navy font-semibold">{d.name}</Text>
                                                <Text className="w-20 text-right">{d.count}</Text>
                                                <Text className="w-24 text-right">{d.qty.toFixed(2)}</Text>
                                                <Text className="w-28 text-right">₹{d.amount.toFixed(0)}</Text>
                                                <Text className={`w-24 text-right font-bold ${d.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d.profit.toFixed(0)}</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text className="w-24 text-xs">{new Date(d.date).toLocaleDateString()}</Text>
                                                <Text className="w-20 text-xs">{d.invoice_number}</Text>
                                                <Text className="w-32 text-xs" numberOfLines={1}>{d.contactName}</Text>
                                                <Text className="w-24 text-xs">{d.grainName}</Text>
                                                <Text className="w-16 text-right text-xs">{(d.number_of_bags || 0)}</Text>
                                                <Text className="w-16 text-right text-xs">{d.quantity_quintal.toFixed(2)}</Text>
                                                <Text className="w-16 text-right text-xs">{d.rate_per_quintal.toFixed(0)}</Text>
                                                <Text className="w-20 text-right text-xs font-semibold">{d.baseAmount.toFixed(0)}</Text>
                                                <Text className="w-16 text-right text-xs text-red-400">{d.shortageCost > 0 ? d.shortageCost.toFixed(0) : '-'}</Text>
                                                <Text className="w-16 text-right text-xs text-red-400">{d.deductionCost > 0 ? d.deductionCost.toFixed(0) : '-'}</Text>
                                                <Text className="w-16 text-right text-xs text-gray-500">{d.labourCostTotal > 0 ? d.labourCostTotal.toFixed(0) : '-'}</Text>
                                                <Text className="w-16 text-right text-xs text-gray-500">{d.transportCostTotal > 0 ? d.transportCostTotal.toFixed(0) : '-'}</Text>
                                                <Text className="w-24 text-right text-xs font-bold text-brand-navy">{d.netRealized.toFixed(0)}</Text>

                                                {reportType === 'profit' && (
                                                    <>
                                                        <Text className="w-20 text-right text-xs text-gray-500">{(d.cost_price_per_quintal || 0).toFixed(0)}</Text>
                                                        <Text className={`w-24 text-right text-xs font-bold ${d.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d.profit.toFixed(0)}</Text>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </View>
                                ))}

                                {/* Total Row */}
                                {reportData.length > 0 && (
                                    <View className="flex-row border-t-2 border-brand-navy py-2 mt-2 bg-gray-50">
                                        {groupBy !== 'none' ? (
                                            <>
                                                <Text className="w-32 font-bold text-brand-navy">TOTAL</Text>
                                                <Text className="w-20 text-right font-bold">{reportData.reduce((sum, d) => sum + d.count, 0)}</Text>
                                                <Text className="w-24 text-right font-bold">{reportData.reduce((sum, d) => sum + d.qty, 0).toFixed(2)}</Text>
                                                <Text className="w-28 text-right font-bold">₹{reportData.reduce((sum, d) => sum + d.amount, 0).toFixed(0)}</Text>
                                                <Text className="w-24 text-right font-bold">₹{reportData.reduce((sum, d) => sum + d.profit, 0).toFixed(0)}</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text className="w-[176px] font-bold text-brand-navy">TOTAL</Text> {/* Date + Invoice + Party */}
                                                <Text className="w-24 font-bold"></Text> {/* Grain */}
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + (d.number_of_bags || 0), 0)}</Text>
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + d.quantity_quintal, 0).toFixed(2)}</Text>
                                                <Text className="w-16 text-right font-bold"></Text> {/* Rate */}
                                                <Text className="w-20 text-right font-bold">{reportData.reduce((sum, d) => sum + d.baseAmount, 0).toFixed(0)}</Text>
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + d.shortageCost, 0).toFixed(0)}</Text>
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + d.deductionCost, 0).toFixed(0)}</Text>
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + d.labourCostTotal, 0).toFixed(0)}</Text>
                                                <Text className="w-16 text-right font-bold">{reportData.reduce((sum, d) => sum + d.transportCostTotal, 0).toFixed(0)}</Text>
                                                <Text className="w-24 text-right font-bold">{reportData.reduce((sum, d) => sum + d.netRealized, 0).toFixed(0)}</Text>
                                                {reportType === 'profit' && (
                                                    <>
                                                        <Text className="w-20 text-right font-bold"></Text>
                                                        <Text className="w-24 text-right font-bold">{reportData.reduce((sum, d) => sum + d.profit, 0).toFixed(0)}</Text>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                    </ScrollView>
                </View>
            )}

            {/* Filter Modal */}
            <Modal visible={isFilterModalVisible} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <View className="flex-row justify-between mb-4">
                            <Text className="text-xl font-bold text-brand-navy">Advanced Filters</Text>
                            <TouchableOpacity onPress={() => {
                                setFilterStartDate('');
                                setFilterEndDate('');
                                setFilterStatus('all');
                            }}>
                                <Text className="text-red-500 font-bold">Clear All</Text>
                            </TouchableOpacity>
                        </View>

                        <Text className="font-bold text-gray-700 mb-2">Payment Status</Text>
                        <View className="flex-row flex-wrap mb-4">
                            {['all', 'paid', 'pending', 'partial'].map(s => (
                                <TouchableOpacity
                                    key={s}
                                    onPress={() => setFilterStatus(s)}
                                    className={`mr-2 mb-2 px-4 py-2 rounded-lg border ${filterStatus === s ? 'bg-brand-navy border-brand-navy' : 'bg-gray-100 border-gray-200'}`}
                                >
                                    <Text className={`capitalize font-bold ${filterStatus === s ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text className="font-bold text-gray-700 mb-2">Date Range</Text>
                        <View className="flex-row space-x-4 mb-6">
                            <View className="flex-1">
                                <Text className="text-xs text-gray-500 mb-1">Start Date (YYYY-MM-DD)</Text>
                                <TextInput
                                    className="bg-gray-100 p-3 rounded-lg border border-gray-200"
                                    placeholder="2024-01-01"
                                    value={filterStartDate}
                                    onChangeText={setFilterStartDate}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-xs text-gray-500 mb-1">End Date (YYYY-MM-DD)</Text>
                                <TextInput
                                    className="bg-gray-100 p-3 rounded-lg border border-gray-200"
                                    placeholder="2024-12-31"
                                    value={filterEndDate}
                                    onChangeText={setFilterEndDate}
                                />
                            </View>
                        </View>

                        <TouchableOpacity onPress={() => setFilterModalVisible(false)} className="bg-brand-navy p-4 rounded-xl items-center mb-3">
                            <Text className="text-white font-bold text-lg">Apply Filters</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilterModalVisible(false)} className="p-4 items-center">
                            <Text className="text-gray-500">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Payment Modal */}
            <Modal visible={isPaymentModalVisible} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <Text className="text-xl font-bold text-brand-navy mb-4">Record Payment</Text>
                        {selectedTrx && (
                            <View className="mb-4 bg-gray-50 p-4 rounded-xl">
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-gray-500">Total Amount</Text>
                                    <Text className="font-bold">₹ {selectedTrx.total_amount.toFixed(2)}</Text>
                                </View>
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-gray-500">Paid Till Now</Text>
                                    <Text className="font-bold text-green-600">₹ {(selectedTrx.amount_paid || 0).toFixed(2)}</Text>
                                </View>
                                <View className="h-[1px] bg-gray-200 my-2" />
                                <View className="flex-row justify-between">
                                    <Text className="text-brand-navy font-bold">Pending Amount</Text>
                                    <Text className="font-bold text-red-500">₹ {(selectedTrx.total_amount - (selectedTrx.amount_paid || 0)).toFixed(2)}</Text>
                                </View>
                            </View>
                        )}
                        <Text className="font-bold text-gray-700 mb-2">Amount Paying Now</Text>
                        <TextInput
                            className="bg-gray-100 p-4 rounded-xl text-xl font-bold mb-6 border border-gray-200"
                            placeholder="0.00"
                            keyboardType="numeric"
                            value={paymentAmount}
                            onChangeText={setPaymentAmount}
                        />
                        <TouchableOpacity onPress={handlePaymentSubmit} className="bg-brand-navy p-4 rounded-xl items-center mb-3">
                            <Text className="text-white font-bold text-lg">Confirm Payment</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setPaymentModalVisible(false)} className="p-4 items-center">
                            <Text className="text-gray-500">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default ReportsScreen;
