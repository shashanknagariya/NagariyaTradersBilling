import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform, ActivityIndicator } from 'react-native';
import client from '../api/client';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useLanguage } from '../context/LanguageContext';


const EditTransactionScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { transactionId } = route.params;
    const { t } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [originalTrx, setOriginalTrx] = useState(null);

    // Form Fields
    const [date, setDate] = useState('');
    const [contactId, setContactId] = useState(null);
    const [grainId, setGrainId] = useState(null);
    const [warehouseId, setWarehouseId] = useState(null);
    const [quantityQtl, setQuantityQtl] = useState('');
    const [numBags, setNumBags] = useState('');
    const [bharti, setBharti] = useState(''); // New Field
    const [rate, setRate] = useState('');

    // Sales Only Fields
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [destination, setDestination] = useState('');

    // Cost Fields
    const [labourCost, setLabourCost] = useState('');
    const [transportCost, setTransportCost] = useState('');
    const [mandiCost, setMandiCost] = useState('');

    const [notes, setNotes] = useState('');

    // Master Data
    const [grains, setGrains] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [gRes, cRes, wRes, allTrx] = await Promise.all([
                client.get('/master/grains'),
                client.get('/master/contacts'),
                client.get('/master/warehouses'),
                client.get('/transactions/')
            ]);

            const target = allTrx.data.find(t => t.id === transactionId);

            if (!target) {
                Alert.alert("Error", "Transaction not found");
                navigation.goBack();
                return;
            }

            setOriginalTrx(target);
            setGrains(gRes.data);
            setContacts(cRes.data);
            setWarehouses(wRes.data);

            // Pre-fill fields
            setDate(new Date(target.date).toISOString().split('T')[0]);
            setContactId(target.contact_id);
            setGrainId(target.grain_id);
            setWarehouseId(target.warehouse_id);
            setQuantityQtl(target.quantity_quintal.toString());
            setNumBags(target.number_of_bags ? target.number_of_bags.toString() : '');

            // Calculate initial Bharti
            if (target.number_of_bags && target.quantity_quintal) {
                const b = (target.quantity_quintal * 100) / target.number_of_bags;
                setBharti(b.toFixed(2));
            }

            setRate(target.rate_per_quintal.toString());
            setVehicleNumber(target.vehicle_number || '');
            setDriverName(target.driver_name || '');
            setDestination(target.destination || '');
            setNotes(target.notes || '');

            setLabourCost(target.labour_cost_per_bag ? target.labour_cost_per_bag.toString() : '3.0');
            setTransportCost(target.transport_cost_per_qtl ? target.transport_cost_per_qtl.toString() : '0.0');
            setMandiCost(target.mandi_cost ? target.mandi_cost.toString() : '0.0');

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    // Auto-calculate logic
    const handleBhartiChange = (text) => {
        setBharti(text);
        const b = parseFloat(text);
        const bags = parseFloat(numBags);
        if (!isNaN(b) && !isNaN(bags)) {
            const q = (bags * b) / 100;
            setQuantityQtl(q.toFixed(2));
        }
    };

    const handleBagsChange = (text) => {
        setNumBags(text);
        const bags = parseFloat(text);
        const b = parseFloat(bharti);
        if (!isNaN(bags) && !isNaN(b)) {
            const q = (bags * b) / 100;
            setQuantityQtl(q.toFixed(2));
        }
    };

    const handleSave = async () => {
        try {
            const qty = parseFloat(quantityQtl);
            const r = parseFloat(rate);
            const bags = parseFloat(numBags) || 0;
            const lRate = parseFloat(labourCost) || 0;

            // Calc Total
            const grainVal = qty * r;
            const labourDed = bags * lRate;

            let total = grainVal;
            if (!isSale) {
                // For Purchase: Total = GrainValue - Labour
                total = grainVal - labourDed;
            } else {
                // For Sale: Total = GrainValue (Gross)
                // Labour is an expense, separate
                total = grainVal;
            }

            const updatePayload = {
                date: new Date(date).toISOString(),
                contact_id: contactId,
                grain_id: grainId,
                warehouse_id: warehouseId,
                quantity_quintal: qty,
                number_of_bags: bags,
                rate_per_quintal: r,
                total_amount: total,
                notes: notes,
                labour_cost_per_bag: lRate,
                transport_cost_per_qtl: parseFloat(transportCost) || 0,
                mandi_cost: parseFloat(mandiCost) || 0
            };

            // Only add sales fields if it's a sale
            if (originalTrx?.type === 'sale') {
                updatePayload.vehicle_number = vehicleNumber;
                updatePayload.driver_name = driverName;
                updatePayload.destination = destination;
            }

            await client.put(`/transactions/${transactionId}`, updatePayload);
            Alert.alert(t('success'), t('transactionUpdated'));
            navigation.goBack();
        } catch (e) {
            console.error(e);
            Alert.alert(t('error'), t('failedToUpdate'));
        }
    };

    if (loading) return <ActivityIndicator className="mt-20" size="large" />;

    const isSale = originalTrx?.type === 'sale';

    return (
        <View className="flex-1 bg-gray-50">
            <View className="bg-brand-navy pt-12 pb-4 px-6 shadow-sm z-10 flex-row items-center">
                <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                    <Text className="text-white text-2xl">←</Text>
                </TouchableOpacity>
                <Text className="text-xl font-bold text-white">{isSale ? t('editSale') : t('editPurchase')} #{transactionId}</Text>
            </View>

            <ScrollView className="p-6">
                <View className="bg-white p-6 rounded-xl shadow-sm mb-6">

                    <Label>{t('date')}</Label>
                    {Platform.OS === 'web' ? (
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            onClick={(e) => e.target.showPicker()}
                            style={{
                                padding: 12,
                                borderRadius: 8,
                                border: '1px solid #e5e7eb',
                                fontSize: 16,
                                marginBottom: 16,
                                backgroundColor: '#f9fafb',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}
                        />
                    ) : (
                        <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
                    )}

                    {/* Simple Dropdowns (Text for now, improved UI later if needed) */}
                    <Label>{t('items')}</Label>
                    <View className="flex-row flex-wrap mb-4">
                        {grains.map(g => (
                            <TouchableOpacity
                                key={g.id}
                                onPress={() => setGrainId(g.id)}
                                className={`mr-2 mb-2 px-3 py-2 rounded-lg border ${grainId === g.id ? 'bg-brand-gold border-brand-gold' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <Text className={`font-bold ${grainId === g.id ? 'text-brand-navy' : 'text-gray-600'}`}>{g.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Label>{t('warehouse')}</Label>
                    <View className="flex-row flex-wrap mb-4">
                        {warehouses.map(w => (
                            <TouchableOpacity
                                key={w.id}
                                onPress={() => setWarehouseId(w.id)}
                                className={`mr-2 mb-2 px-3 py-2 rounded-lg border ${warehouseId === w.id ? 'bg-brand-gold border-brand-gold' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <Text className={`font-bold ${warehouseId === w.id ? 'text-brand-navy' : 'text-gray-600'}`}>{w.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Label>{t('noOfBags')}</Label>
                    <Input value={numBags} onChangeText={handleBagsChange} keyboardType="numeric" />

                    {!isSale && (
                        <>
                            <Label>{t('bharti')}</Label>
                            <Input value={bharti} onChangeText={handleBhartiChange} keyboardType="numeric" placeholder="e.g. 50" />
                        </>
                    )}

                    <Label>{t('quantityQtl')}</Label>
                    <Input value={quantityQtl} onChangeText={setQuantityQtl} keyboardType="numeric" />

                    <Label>{t('ratePerQtl')}</Label>
                    <Input value={rate} onChangeText={setRate} keyboardType="numeric" />

                    {/* NEW COST FIELDS */}
                    <View className="h-[1px] bg-gray-200 my-4" />
                    <Text className="font-bold text-gray-400 mb-4 uppercase tracking-widest text-xs">{t('costDetails')}</Text>

                    <Label>{t('labourCostPerBag')}</Label>
                    <Input value={labourCost} onChangeText={setLabourCost} keyboardType="numeric" placeholder="3.0" />

                    {isSale && (
                        <>
                            <Label>{t('transportCostPerQtl')}</Label>
                            <Input value={transportCost} onChangeText={setTransportCost} keyboardType="numeric" placeholder="0.0" />

                            <Label>{t('mandiCost')} ({t('total')})</Label>
                            <Input value={mandiCost} onChangeText={setMandiCost} keyboardType="numeric" placeholder="0.0" />
                        </>
                    )}


                    {isSale && (
                        <>
                            <View className="h-[1px] bg-gray-200 my-4" />
                            <Text className="font-bold text-gray-400 mb-4 uppercase tracking-widest text-xs">{t('dispatchDetails')}</Text>

                            <Label>{t('vehicleNo')}</Label>
                            <Input value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="MP-21-..." />

                            <Label>{t('driverName')}</Label>
                            <Input value={driverName} onChangeText={setDriverName} />

                            <Label>{t('destination')}</Label>
                            <Input value={destination} onChangeText={setDestination} />
                        </>
                    )}

                    <Label>{t('notes')}</Label>
                    <Input value={notes} onChangeText={setNotes} multiline />

                    <TouchableOpacity
                        onPress={handleSave}
                        className="bg-brand-gold p-4 rounded-xl items-center mt-4"
                    >
                        <Text className="font-bold text-brand-navy text-lg">{t('saveChanges')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
};

const Label = ({ children }) => <Text className="font-bold text-gray-700 mb-2">{children}</Text>;
const Input = (props) => (
    <TextInput
        className="bg-gray-50 border border-gray-200 p-3 rounded-lg mb-4 text-base"
        {...props}
    />
);

export default EditTransactionScreen;
