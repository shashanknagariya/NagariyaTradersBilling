import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, Platform, KeyboardAvoidingView } from 'react-native';
import client from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { useLanguage } from '../context/LanguageContext';

const SalesScreen = () => {
    const navigation = useNavigation();
    const { t } = useLanguage();

    // Master Data
    const [grains, setGrains] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [buyers, setBuyers] = useState([]);

    // Selections
    const [selectedGrain, setSelectedGrain] = useState(null);
    const [selectedBuyer, setSelectedBuyer] = useState(null);

    // Multi-Warehouse Allocation
    // Structure: { warehouseId: numberOfBags }
    const [allocations, setAllocations] = useState({});

    // Inputs
    const [totalWeight, setTotalWeight] = useState(''); // Manual Total Weight Input
    const [rate, setRate] = useState('');
    const [gstRate, setGstRate] = useState('0');

    // Costs
    const [labourCost, setLabourCost] = useState('3.00'); // Per Bag
    const [transportCost, setTransportCost] = useState('0.00'); // Per Quintal
    const [transportAdvance, setTransportAdvance] = useState(''); // Total Advance for this bill
    const [mandiCost, setMandiCost] = useState('9000'); // Total Mandi Cost
    const [transporterName, setTransporterName] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [driverName, setDriverName] = useState('');
    const [destination, setDestination] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    // Creation States
    const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
    const [isNewBuyerMode, setIsNewBuyerMode] = useState(false);
    const [newBuyerName, setNewBuyerName] = useState('');
    const [newBuyerGst, setNewBuyerGst] = useState('');

    const [isGrainModalOpen, setIsGrainModalOpen] = useState(false);

    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

    // Computed
    const totalBags = Object.values(allocations).reduce((sum, val) => sum + (parseInt(val) || 0), 0);
    const totalWeightKg = parseFloat(totalWeight) || 0;
    const totalWeightQtl = totalWeightKg / 100;
    const subTotal = totalWeightQtl * (parseFloat(rate) || 0);
    const gstAmount = subTotal * ((parseFloat(gstRate) || 0) / 100);
    const grandTotal = subTotal + gstAmount;

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        try {
            const [gRes, wRes, cRes] = await Promise.all([
                client.get('/master/grains'),
                client.get('/master/warehouses'),
                client.get('/master/contacts')
            ]);
            setGrains(gRes.data);
            setWarehouses(wRes.data);
            setBuyers(cRes.data.filter(c => c.type === 'buyer'));
        } catch (e) {
            console.log("Error fetching master data", e);
        }
    };

    const handleCreateBuyer = async () => {
        if (!newBuyerName.trim()) {
            Alert.alert(t('error'), t('reqName'));
            return;
        }
        try {
            const res = await client.post('/master/contacts', {
                name: newBuyerName,
                type: 'buyer',
                gst_number: newBuyerGst
            });
            setBuyers([...buyers, res.data]);
            setSelectedBuyer(res.data);
            setIsNewBuyerMode(false);
            setIsBuyerModalOpen(false);
            setNewBuyerName('');
            setNewBuyerGst('');
        } catch (e) {
            Alert.alert(t('error'), t('failedToUpdate'));
        }
    };

    const handleSale = async () => {
        if (!selectedGrain || !selectedBuyer || totalBags === 0 || !rate) {
            Alert.alert(t('error'), t('fillAll'));
            return;
        }

        const warehouseList = Object.entries(allocations)
            .filter(([_, bags]) => parseInt(bags) > 0)
            .map(([wId, bags]) => ({
                warehouse_id: parseInt(wId),
                bags: parseInt(bags)
            }));

        const payload = {
            date: new Date(date).toISOString(),
            contact_id: selectedBuyer.id,
            grain_id: selectedGrain.id,
            rate_per_quintal: parseFloat(rate),
            total_weight_kg: parseFloat(totalWeight),
            tax_percentage: parseFloat(gstRate) || 0,
            labour_cost_per_bag: parseFloat(labourCost),
            transport_cost_per_qtl: parseFloat(transportCost),
            transport_advance: parseFloat(transportAdvance) || 0,
            mandi_cost: parseFloat(mandiCost) || 0, // NEW
            transporter_name: transporterName,
            destination: destination,
            driver_name: driverName,
            vehicle_number: vehicleNo,
            warehouses: warehouseList
        };

        try {
            await client.post('/transactions/bulk_sale', payload);
            if (Platform.OS === 'web') {
                alert(t('success') + ": " + t('saleSuccess'));
                navigation.navigate('Home');
            } else {
                Alert.alert(t('success'), t('saleSuccess'), [
                    { text: "OK", onPress: () => navigation.navigate('Home') }
                ]);
            }
            // Reset
            setAllocations({});
            setRate('');
            setTransporterName('');
            setVehicleNo('');
            setDriverName('');
            setDestination('');
            setTransportAdvance('0');
        } catch (e) {
            console.error(e);
            let msg = e.response?.data?.detail || t('failedRecord');

            // Localize specific backend errors
            if (msg.includes("Insufficient stock")) {
                // Keep the details (numbers) but translate the main message
                // Backend: "Insufficient stock in {wh}. Available: ... Requested: ..."
                msg = t('insufficientStock') + "\n" + msg.split('. ')[1];
            }

            Alert.alert(t('error'), msg);
        }
    };



    const toggleAllocation = (wId, bags) => {
        setAllocations(prev => ({
            ...prev,
            [wId]: bags
        }));
    };

    return (
        <View className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-6 px-6 rounded-b-3xl shadow-lg z-20">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                        <Text className="text-white text-2xl">←</Text>
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-white">{t('newSale')}</Text>
                </View>
            </View>

            {Platform.OS === 'web' ? (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 150 }}>
                    {renderContent()}
                </ScrollView>
            ) : (
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    className="flex-1"
                    keyboardVerticalOffset={100}
                >
                    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 150 }}>
                        {renderContent()}
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* Modals */}
            {renderBuyerModal()}
            {renderGrainModal()}
            {renderAllocationModal()}
        </View>
    );

    function renderContent() {
        return (
            <View className="bg-white p-6 rounded-2xl shadow-sm">
                <Text className="text-brand-navy font-bold mb-2 ml-1">{t('date')}</Text>
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
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl text-lg border border-gray-200 mb-4"
                        value={date}
                        onChangeText={setDate}
                        placeholder="YYYY-MM-DD"
                    />
                )}

                {/* 1. Party Details */}
                <Text className="text-xl font-bold text-brand-navy mb-4 border-b border-gray-100 pb-2">{t('party')}</Text>
                <Dropdown
                    label={t('buyer')}
                    value={selectedBuyer?.name}
                    placeholder={t('buyer')}
                    onPress={() => setIsBuyerModalOpen(true)}
                />
                {selectedBuyer && (
                    <Text className="text-gray-500 mb-4 ml-1">GST: {selectedBuyer.gst_number || 'N/A'}</Text>
                )}

                {/* 2. Grain */}
                <Dropdown
                    label={t('selectGrain')}
                    value={selectedGrain?.name}
                    placeholder={t('selectGrain')}
                    onPress={() => setIsGrainModalOpen(true)}
                />

                {/* 3. Loading Warehouse (Multi-select) */}
                <Text className="text-brand-navy font-bold mb-2 ml-1">{t('storageLocation')} ({t('selectWarehouse')})</Text>
                <TouchableOpacity
                    className="bg-brand-navy/5 p-4 rounded-xl border border-brand-navy/10 mb-2"
                    onPress={() => setIsAllocationModalOpen(true)}
                >
                    <Text className="text-brand-navy font-semibold text-center">
                        {totalBags > 0 ? `${Object.keys(allocations).filter(k => allocations[k] > 0).length} ${t('warehouse')} Selected` : t('selectWarehouse')}
                    </Text>
                </TouchableOpacity>
                <Text className="text-right text-brand-gold font-bold mb-4">{t('bags')}: {totalBags}</Text>

                {/* 4. Weight & Rate */}
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label={t('totalWeight') + " (kg)"} value={totalWeight} onChange={setTotalWeight} keyboardType="numeric" placeholder="0" />
                    </View>
                    <View className="w-[48%]">
                        <Text className="text-brand-navy font-bold mb-2 ml-1">{t('totalWeight')} (Qtl)</Text>
                        <View className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                            <Text className="text-lg text-gray-600">{totalWeightQtl.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                <LabeledInput label={`${t('rate')} (₹/Qtl)`} value={rate} onChange={setRate} keyboardType="numeric" placeholder="0.00" />

                {/* 5. Payment Details */}
                <View className="bg-brand-navy p-5 rounded-xl mb-6 shadow-lg">
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">Subtotal</Text>
                        <Text className="text-white font-bold">₹ {subTotal.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-gray-300">{t('gst')} (%)</Text>
                        <TextInput
                            className="bg-white/10 text-white p-1 px-3 rounded text-right w-16"
                            value={gstRate}
                            onChangeText={setGstRate}
                            keyboardType="numeric"
                        />
                    </View>
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">{t('gst')} Amount</Text>
                        <Text className="text-white">₹ {gstAmount.toFixed(2)}</Text>
                    </View>
                    <View className="h-[1px] bg-gray-600 my-2" />
                    <View className="flex-row justify-between items-center">
                        <Text className="text-brand-gold font-bold text-lg">{t('grandTotal')}</Text>
                        <Text className="text-brand-gold font-bold text-2xl">₹ {grandTotal.toFixed(2)}</Text>
                    </View>
                </View>

                {/* 5.5 Hidden Costs (Internal) */}
                <Text className="text-xl font-bold text-gray-400 mb-4 border-b border-gray-100 pb-2 mt-4">Internal Costs ({t('profit')} calc)</Text>
                <View className="flex-row justify-between flex-wrap">
                    <View className="w-[48%] mb-4">
                        <LabeledInput label={`${t('labourCost')} / ${t('bags')}`} value={labourCost} onChange={setLabourCost} keyboardType="numeric" placeholder="3.00" />
                    </View>
                    <View className="w-[48%] mb-4">
                        <LabeledInput label={`${t('transportCost')} / Qtl`} value={transportCost} onChange={setTransportCost} keyboardType="numeric" placeholder="0.00" />
                    </View>
                    <View className="w-[48%] mb-4">
                        <LabeledInput label={t('mandiCost') + " (Total)"} value={mandiCost} onChange={setMandiCost} keyboardType="numeric" placeholder="9000" />
                    </View>
                </View>

                {/* 6. Transport Details */}
                <Text className="text-xl font-bold text-brand-navy mb-4 border-b border-gray-100 pb-2">{t('dispatchDetails')}</Text>
                <LabeledInput label={t('transporterName')} value={transporterName} onChange={setTransporterName} placeholder={t('transporterName')} />
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label={t('vehicleNo')} value={vehicleNo} onChange={setVehicleNo} placeholder="HR-XX-XXXX" />
                    </View>
                    <View className="w-[48%]">
                        <LabeledInput label={t('driverName')} value={driverName} onChange={setDriverName} placeholder="Driver Name" />
                    </View>
                </View>
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label={t('destination')} value={destination} onChange={setDestination} placeholder="City/State" />
                    </View>
                    <View className="w-[48%]">
                        <LabeledInput label={t('advanceDriver')} value={transportAdvance} onChange={setTransportAdvance} keyboardType="numeric" placeholder="0" />
                    </View>
                </View>

                <TouchableOpacity
                    className="bg-brand-gold p-4 rounded-xl items-center shadow-md active:opacity-90 mt-4"
                    onPress={handleSale}
                >
                    <Text className="text-brand-navy text-xl font-bold">{t('generateBill')}</Text>
                </TouchableOpacity>

            </View>
        );
    }

    function renderBuyerModal() {
        return (
            <Modal visible={isBuyerModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[70%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-2xl font-bold text-brand-navy">{t('buyer')}</Text>
                            {!isNewBuyerMode && (
                                <TouchableOpacity onPress={() => setIsNewBuyerMode(true)} className="bg-brand-gold px-4 py-2 rounded-lg">
                                    <Text className="text-brand-navy font-bold">{t('addNew')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isNewBuyerMode ? (
                            <View>
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder={t('enterName')}
                                    value={newBuyerName}
                                    onChangeText={setNewBuyerName}
                                />
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder={t('gst') + " (Optional)"}
                                    value={newBuyerGst}
                                    onChangeText={setNewBuyerGst}
                                />
                                <TouchableOpacity onPress={handleCreateBuyer} className="bg-brand-navy p-4 rounded-xl items-center mb-2">
                                    <Text className="text-white font-bold">{t('saveSupplier')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsNewBuyerMode(false)} className="p-4 items-center">
                                    <Text className="text-gray-500">{t('cancel')}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <FlatList
                                    data={buyers}
                                    keyExtractor={item => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity className="p-4 border-b border-gray-100" onPress={() => { setSelectedBuyer(item); setIsBuyerModalOpen(false); }}>
                                            <Text className="text-lg text-brand-navy">{item.name}</Text>
                                            {item.gst_number && <Text className="text-gray-400 text-sm">GST: {item.gst_number}</Text>}
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity onPress={() => setIsBuyerModalOpen(false)} className="mt-4 p-4 bg-gray-200 rounded-xl items-center">
                                    <Text className="font-bold">{t('close')}</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        );
    }

    function renderGrainModal() {
        return (
            <Modal visible={isGrainModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[50%]">
                        <Text className="text-2xl font-bold text-brand-navy mb-4">{t('selectGrain')}</Text>
                        <FlatList
                            data={grains}
                            keyExtractor={item => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity className="p-4 border-b border-gray-100" onPress={() => { setSelectedGrain(item); setIsGrainModalOpen(false); }}>
                                    <Text className="text-lg text-brand-navy">{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity onPress={() => setIsGrainModalOpen(false)} className="mt-4 p-4 bg-gray-200 rounded-xl items-center">
                            <Text className="font-bold">{t('close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    }

    function renderAllocationModal() {
        return (
            <Modal visible={isAllocationModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[80%]">
                        <Text className="text-2xl font-bold text-brand-navy mb-4">{t('allocateBags')}</Text>
                        <Text className="text-gray-500 mb-4">{t('enterBagsPrompt')}</Text>

                        <FlatList
                            data={warehouses}
                            keyExtractor={item => item.id.toString()}
                            renderItem={({ item }) => (
                                <View className="flex-row justify-between items-center p-4 border-b border-gray-100">
                                    <View className="flex-1">
                                        <Text className="text-lg text-brand-navy font-semibold">{item.name}</Text>
                                        <Text className="text-gray-400 text-sm">{item.location}</Text>
                                    </View>
                                    <TextInput
                                        className="bg-gray-100 p-2 px-4 rounded-lg w-24 text-center text-lg font-bold border border-gray-200"
                                        placeholder="0"
                                        keyboardType="numeric"
                                        value={allocations[item.id]?.toString() || ''}
                                        onChangeText={(text) => toggleAllocation(item.id, text)}
                                    />
                                </View>
                            )}
                        />

                        <View className="mt-4">
                            <Text className="text-center font-bold text-brand-navy text-lg mb-2">{t('totalAmount')}: {totalBags} {t('bags')}</Text>
                            <TouchableOpacity onPress={() => setIsAllocationModalOpen(false)} className="bg-brand-navy p-4 rounded-xl items-center">
                                <Text className="text-white font-bold">{t('confirmAllocation')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }
};


// Components (Defined outside to prevent re-render focus loss)
const Dropdown = ({ label, value, onPress, placeholder }) => (
    <View className="mb-4">
        <Text className="text-brand-navy font-bold mb-2 ml-1">{label}</Text>
        <TouchableOpacity
            className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex-row justify-between items-center"
            onPress={onPress}
        >
            <Text className={`text-lg ${value ? 'text-brand-navy font-semibold' : 'text-gray-400'}`}>
                {value || placeholder}
            </Text>
            <Text className="text-gray-400">▼</Text>
        </TouchableOpacity>
    </View>
);

const LabeledInput = ({ label, value, onChange, placeholder, keyboardType = 'default' }) => (
    <View className="mb-4">
        <Text className="text-brand-navy font-bold mb-2 ml-1">{label}</Text>
        <TextInput
            className={`bg-gray-50 p-4 rounded-xl text-lg border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            keyboardType={keyboardType}
        />
    </View>
);

export default SalesScreen;
