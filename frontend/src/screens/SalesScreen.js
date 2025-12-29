import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, Platform, KeyboardAvoidingView } from 'react-native';
import client from '../api/client';
import { useNavigation } from '@react-navigation/native';

const SalesScreen = () => {
    const navigation = useNavigation();

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
    const [bharti, setBharti] = useState('60');
    const [rate, setRate] = useState('');
    const [gstRate, setGstRate] = useState('0');

    // Costs
    const [labourCost, setLabourCost] = useState('3');
    const [transportCost, setTransportCost] = useState('0');

    // Transport Details
    const [transporter, setTransporter] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [driverName, setDriverName] = useState('');
    const [destination, setDestination] = useState('');

    // Creation States
    const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
    const [isNewBuyerMode, setIsNewBuyerMode] = useState(false);
    const [newBuyerName, setNewBuyerName] = useState('');
    const [newBuyerGst, setNewBuyerGst] = useState('');

    const [isGrainModalOpen, setIsGrainModalOpen] = useState(false);

    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

    // Computed
    const totalBags = Object.values(allocations).reduce((sum, val) => sum + (parseInt(val) || 0), 0);
    const totalWeightKg = totalBags * (parseFloat(bharti) || 0);
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
            Alert.alert("Error", "Name is required");
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
            Alert.alert("Error", "Failed to create buyer");
        }
    };

    const handleSale = async () => {
        if (!selectedGrain || !selectedBuyer || totalBags === 0 || !rate) {
            Alert.alert("Error", "Please fill essential fields (Buyer, Grain, Warehouses, Rate)");
            return;
        }

        const warehouseList = Object.entries(allocations)
            .filter(([_, bags]) => parseInt(bags) > 0)
            .map(([wId, bags]) => ({
                warehouse_id: parseInt(wId),
                bags: parseInt(bags)
            }));

        const payload = {
            contact_id: selectedBuyer.id,
            grain_id: selectedGrain.id,
            rate_per_quintal: parseFloat(rate),
            bharti: parseFloat(bharti),
            tax_percentage: parseFloat(gstRate) || 0,
            labour_cost_per_bag: parseFloat(labourCost),
            transport_cost_per_qtl: parseFloat(transportCost),
            transporter_name: transporter,
            destination: destination,
            driver_name: driverName,
            vehicle_number: vehicleNo,
            warehouses: warehouseList
        };

        try {
            await client.post('/transactions/bulk_sale', payload);
            if (Platform.OS === 'web') {
                alert("Success: Bill Generated Successfully!");
                navigation.navigate('Home');
            } else {
                Alert.alert("Success", "Bill Generated Successfully!", [
                    { text: "OK", onPress: () => navigation.navigate('Home') }
                ]);
            }
            // Reset
            setAllocations({});
            setRate('');
            setTransporter('');
            setVehicleNo('');
            setDriverName('');
            setDestination('');
        } catch (e) {
            console.error(e);
            const msg = e.response?.data?.detail || "Failed to generate bill";
            Alert.alert("Error", msg);
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
                    <Text className="text-2xl font-bold text-white">New Sale (Bill)</Text>
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

                {/* 1. Party Details */}
                <Text className="text-xl font-bold text-brand-navy mb-4 border-b border-gray-100 pb-2">Party Details</Text>
                <Dropdown
                    label="Buyer Name"
                    value={selectedBuyer?.name}
                    placeholder="Select Buyer"
                    onPress={() => setIsBuyerModalOpen(true)}
                />
                {selectedBuyer && (
                    <Text className="text-gray-500 mb-4 ml-1">GST No: {selectedBuyer.gst_number || 'N/A'}</Text>
                )}

                {/* 2. Grain */}
                <Dropdown
                    label="Grain"
                    value={selectedGrain?.name}
                    placeholder="Select Grain"
                    onPress={() => setIsGrainModalOpen(true)}
                />

                {/* 3. Loading Warehouse (Multi-select) */}
                <Text className="text-brand-navy font-bold mb-2 ml-1">Loading From (Warehouses)</Text>
                <TouchableOpacity
                    className="bg-brand-navy/5 p-4 rounded-xl border border-brand-navy/10 mb-2"
                    onPress={() => setIsAllocationModalOpen(true)}
                >
                    <Text className="text-brand-navy font-semibold text-center">
                        {totalBags > 0 ? `${Object.keys(allocations).filter(k => allocations[k] > 0).length} Warehouses Selected` : "Select Warehouses & Bags"}
                    </Text>
                </TouchableOpacity>
                <Text className="text-right text-brand-gold font-bold mb-4">Total Bags: {totalBags}</Text>

                {/* 4. Weight & Rate */}
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label="Bharti (kg/bag)" value={bharti} onChange={setBharti} keyboardType="numeric" />
                    </View>
                    <View className="w-[48%]">
                        <Text className="text-brand-navy font-bold mb-2 ml-1">Est. Weight (Qtl)</Text>
                        <View className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                            <Text className="text-lg text-gray-600">{totalWeightQtl.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                <LabeledInput label="Rate (₹/Quintal)" value={rate} onChange={setRate} keyboardType="numeric" placeholder="0.00" />

                {/* 5. Payment Details */}
                <View className="bg-brand-navy p-5 rounded-xl mb-6 shadow-lg">
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">Subtotal</Text>
                        <Text className="text-white font-bold">₹ {subTotal.toFixed(2)}</Text>
                    </View>
                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-gray-300">GST (%)</Text>
                        <TextInput
                            className="bg-white/10 text-white p-1 px-3 rounded text-right w-16"
                            value={gstRate}
                            onChangeText={setGstRate}
                            keyboardType="numeric"
                        />
                    </View>
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">GST Amount</Text>
                        <Text className="text-white">₹ {gstAmount.toFixed(2)}</Text>
                    </View>
                    <View className="h-[1px] bg-gray-600 my-2" />
                    <View className="flex-row justify-between items-center">
                        <Text className="text-brand-gold font-bold text-lg">Grand Total</Text>
                        <Text className="text-brand-gold font-bold text-2xl">₹ {grandTotal.toFixed(2)}</Text>
                    </View>
                </View>

                {/* 5.5 Hidden Costs (Internal) */}
                <Text className="text-xl font-bold text-gray-400 mb-4 border-b border-gray-100 pb-2 mt-4">Internal Costs (Profit calc)</Text>
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label="Labour / Bag" value={labourCost} onChange={setLabourCost} keyboardType="numeric" placeholder="3.00" />
                    </View>
                    <View className="w-[48%]">
                        <LabeledInput label="Transport / Qtl" value={transportCost} onChange={setTransportCost} keyboardType="numeric" placeholder="0.00" />
                    </View>
                </View>

                {/* 6. Transport Details */}
                <Text className="text-xl font-bold text-brand-navy mb-4 border-b border-gray-100 pb-2">Transport Details</Text>
                <LabeledInput label="Transporter Name" value={transporter} onChange={setTransporter} placeholder="Transporter Name" />
                <View className="flex-row justify-between">
                    <View className="w-[48%]">
                        <LabeledInput label="Vehicle No" value={vehicleNo} onChange={setVehicleNo} placeholder="HR-XX-XXXX" />
                    </View>
                    <View className="w-[48%]">
                        <LabeledInput label="Driver Name" value={driverName} onChange={setDriverName} placeholder="Driver Name" />
                    </View>
                </View>
                <LabeledInput label="Destination" value={destination} onChange={setDestination} placeholder="City/State" />

                <TouchableOpacity
                    className="bg-brand-gold p-4 rounded-xl items-center shadow-md active:opacity-90 mt-4"
                    onPress={handleSale}
                >
                    <Text className="text-brand-navy text-xl font-bold">Generate Bill</Text>
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
                            <Text className="text-2xl font-bold text-brand-navy">Select Buyer</Text>
                            {!isNewBuyerMode && (
                                <TouchableOpacity onPress={() => setIsNewBuyerMode(true)} className="bg-brand-gold px-4 py-2 rounded-lg">
                                    <Text className="text-brand-navy font-bold">+ New</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isNewBuyerMode ? (
                            <View>
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Party Name"
                                    value={newBuyerName}
                                    onChangeText={setNewBuyerName}
                                />
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="GST Number (Optional)"
                                    value={newBuyerGst}
                                    onChangeText={setNewBuyerGst}
                                />
                                <TouchableOpacity onPress={handleCreateBuyer} className="bg-brand-navy p-4 rounded-xl items-center mb-2">
                                    <Text className="text-white font-bold">Save Buyer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsNewBuyerMode(false)} className="p-4 items-center">
                                    <Text className="text-gray-500">Cancel</Text>
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
                                    <Text className="font-bold">Close</Text>
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
                        <Text className="text-2xl font-bold text-brand-navy mb-4">Select Grain</Text>
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
                            <Text className="font-bold">Close</Text>
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
                        <Text className="text-2xl font-bold text-brand-navy mb-4">Allocate Bags</Text>
                        <Text className="text-gray-500 mb-4">Enter number of bags for each warehouse.</Text>

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
                            <Text className="text-center font-bold text-brand-navy text-lg mb-2">Total Selected: {totalBags} Bags</Text>
                            <TouchableOpacity onPress={() => setIsAllocationModalOpen(false)} className="bg-brand-navy p-4 rounded-xl items-center">
                                <Text className="text-white font-bold">Confirm Allocation</Text>
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
