import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, Platform, KeyboardAvoidingView } from 'react-native';
import client from '../api/client';
import { useNavigation } from '@react-navigation/native';

const PurchaseScreen = () => {
    const navigation = useNavigation();
    const [grains, setGrains] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [contacts, setContacts] = useState([]); // Suppliers

    // Selections
    const [selectedGrain, setSelectedGrain] = useState(null);
    const [selectedWarehouse, setSelectedWarehouse] = useState(null);
    const [selectedContact, setSelectedContact] = useState(null);

    // Inputs
    const [numBags, setNumBags] = useState('');
    const [bharti, setBharti] = useState('60');
    const [rate, setRate] = useState('');
    const [labourCost, setLabourCost] = useState('3'); // Default 3.0

    // New Entry Inputs
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [newContactName, setNewContactName] = useState('');

    const [newGrainName, setNewGrainName] = useState('');
    const [newGrainHindi, setNewGrainHindi] = useState('');

    const [newWarehouseName, setNewWarehouseName] = useState('');
    const [newWarehouseLoc, setNewWarehouseLoc] = useState('');

    // Calculated
    const [totalWeightKg, setTotalWeightKg] = useState('0.00');
    const [totalWeightQtl, setTotalWeightQtl] = useState('0.00');
    const [totalPrice, setTotalPrice] = useState('0.00');

    // UI State
    const [isGrainModalOpen, setIsGrainModalOpen] = useState(false);
    const [isNewGrainMode, setIsNewGrainMode] = useState(false);

    const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
    const [isNewWarehouseMode, setIsNewWarehouseMode] = useState(false);

    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [isNewContactMode, setIsNewContactMode] = useState(false);

    useEffect(() => {
        fetchMasterData();
    }, []);

    useEffect(() => {
        calculateTotals();
    }, [numBags, bharti, rate]);

    const fetchMasterData = async () => {
        try {
            const [gRes, wRes, cRes] = await Promise.all([
                client.get('/master/grains'),
                client.get('/master/warehouses'),
                client.get('/master/contacts')
            ]);
            setGrains(gRes.data);
            setWarehouses(wRes.data);
            setContacts(cRes.data.filter(c => c.type === 'supplier'));
        } catch (e) {
            console.log("Error fetching master data", e);
        }
    };

    const calculateTotals = () => {
        const bags = parseFloat(numBags) || 0;
        const kgsPerBag = parseFloat(bharti) || 0;
        const ratePerQ = parseFloat(rate) || 0;
        const lRate = parseFloat(labourCost) || 0;

        const totalKg = bags * kgsPerBag;
        const totalQ = totalKg / 100;

        // Final Amount = (Weight * Rate) - (Labour * Bags)
        const grainValue = totalQ * ratePerQ;
        const labourDeduction = bags * lRate;
        const amount = grainValue - labourDeduction;

        setTotalWeightKg(totalKg.toFixed(2));
        setTotalWeightQtl(totalQ.toFixed(2));
        setTotalPrice(amount.toFixed(2));
    };

    // --- Creation Handlers ---

    const handleCreateContact = async () => {
        if (!newContactName.trim()) {
            Alert.alert("Error", "Name is required");
            return;
        }
        try {
            console.log("Creating contact:", newContactName);
            const res = await client.post('/master/contacts', {
                name: newContactName,
                type: 'supplier'
            });
            setContacts([...contacts, res.data]);
            setSelectedContact(res.data);
            // Reset UI
            setIsNewContactMode(false);
            setIsContactModalOpen(false);
            setNewContactName('');
        } catch (e) {
            console.error("Create contact failed", e);
            Alert.alert("Error", "Failed to create supplier. Check connection.");
        }
    }

    const handleCreateGrain = async () => {
        if (!newGrainName.trim()) {
            Alert.alert("Error", "Name is required");
            return;
        }
        try {
            const res = await client.post('/master/grains', {
                name: newGrainName,
                hindi_name: newGrainHindi || null
            });
            setGrains([...grains, res.data]);
            setSelectedGrain(res.data);
            setIsNewGrainMode(false);
            setIsGrainModalOpen(false);
            setNewGrainName('');
            setNewGrainHindi('');
        } catch (e) {
            Alert.alert("Error", "Failed to create grain");
        }
    }

    const handleCreateWarehouse = async () => {
        if (!newWarehouseName.trim()) {
            Alert.alert("Error", "Name is required");
            return;
        }
        try {
            const res = await client.post('/master/warehouses', {
                name: newWarehouseName,
                location: newWarehouseLoc || null
            });
            setWarehouses([...warehouses, res.data]);
            setSelectedWarehouse(res.data);
            setIsNewWarehouseMode(false);
            setIsWarehouseModalOpen(false);
            setNewWarehouseName('');
            setNewWarehouseLoc('');
        } catch (e) {
            Alert.alert("Error", "Failed to create warehouse");
        }
    }

    const handlePurchase = async () => {
        if (!selectedGrain || !selectedWarehouse || !selectedContact || !numBags || !rate) {
            Alert.alert("Error", "Please fill all fields");
            return;
        }

        try {
            await client.post('/transactions/', {
                type: 'purchase',
                date: new Date(date).toISOString(),
                grain_id: selectedGrain.id,
                contact_id: selectedContact.id,
                warehouse_id: selectedWarehouse.id,
                quantity_quintal: parseFloat(totalWeightQtl),
                number_of_bags: parseFloat(numBags),
                rate_per_quintal: parseFloat(rate),
                total_amount: parseFloat(totalPrice),
                payment_status: 'pending',
                notes: `${numBags} Bags @ ${bharti}kg. Total ${totalWeightKg} Kg`,
                labour_cost_per_bag: parseFloat(labourCost) || 0
            });
            if (Platform.OS === 'web') {
                alert("Success: Purchase Recorded!");
                navigation.navigate('Home');
            } else {
                Alert.alert("Success", "Purchase Recorded!", [
                    { text: "OK", onPress: () => navigation.navigate('Home') }
                ]);
            }
            setNumBags('');
            setRate('');
        } catch (e) {
            Alert.alert("Error", "Failed to record purchase");
        }
    };

    // Reusable Dropdown
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

    return (
        <View className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-6 px-6 rounded-b-3xl shadow-lg z-20">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                        <Text className="text-white text-2xl">←</Text>
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-white">New Purchase</Text>
                </View>
            </View>

            {Platform.OS === 'web' ? (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ padding: 24, paddingBottom: 150 }}
                    showsVerticalScrollIndicator={false}
                >
                    <View className="bg-white p-6 rounded-2xl shadow-sm">
                        <Text className="text-brand-navy font-bold mb-2 ml-1">Date</Text>
                        {Platform.OS === 'web' ? (
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
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

                        <Dropdown
                            label="Select Grain"
                            value={selectedGrain?.name}
                            placeholder="Choose Grain..."
                            onPress={() => setIsGrainModalOpen(true)}
                        />

                        <Dropdown
                            label="Supplier (Person)"
                            value={selectedContact?.name}
                            placeholder="Choose Supplier..."
                            onPress={() => setIsContactModalOpen(true)}
                        />

                        <Dropdown
                            label="Storage Location"
                            value={selectedWarehouse?.name}
                            placeholder="Choose Warehouse..."
                            onPress={() => setIsWarehouseModalOpen(true)}
                        />

                        <View className="flex-row justify-between mb-4">
                            <View className="w-[48%]">
                                <Text className="text-brand-navy font-bold mb-2 ml-1">No. of Bags</Text>
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    value={numBags}
                                    onChangeText={setNumBags}
                                />
                            </View>
                            <View className="w-[48%]">
                                <Text className="text-brand-navy font-bold mb-2 ml-1">Bharti (kg/bag)</Text>
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                    keyboardType="numeric"
                                    placeholder="60"
                                    value={bharti}
                                    onChangeText={setBharti}
                                />
                            </View>
                        </View>

                        <Text className="text-brand-navy font-bold mb-2 ml-1">Rate (₹/Quintal)</Text>
                        <TextInput
                            className={`bg-gray-50 p-4 rounded-xl mb-6 text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                            keyboardType="numeric"
                            placeholder="0.00"
                            value={rate}
                            onChangeText={setRate}
                        />

                        <Text className="text-brand-navy font-bold mb-2 ml-1">Labour Cost / Bag (Palledari)</Text>
                        <TextInput
                            className={`bg-gray-50 p-4 rounded-xl mb-6 text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                            keyboardType="numeric"
                            placeholder="3.00"
                            value={labourCost}
                            onChangeText={setLabourCost}
                        />

                        <View className="bg-brand-navy p-5 rounded-xl mb-6 shadow-lg">
                            <View className="flex-row justify-between mb-2">
                                <Text className="text-gray-300">Total Weight</Text>
                                <View className="items-end">
                                    <Text className="text-white font-bold text-lg">{totalWeightKg} kg</Text>
                                    <Text className="text-gray-400 text-xs">({totalWeightQtl} Quintal)</Text>
                                </View>
                            </View>
                            <View className="h-[1px] bg-gray-600 my-2" />
                            <View className="flex-row justify-between items-center">
                                <Text className="text-gray-300">Total Amount</Text>
                                <Text className="text-white font-bold text-2xl text-brand-gold">₹ {totalPrice}</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            className="bg-brand-gold p-4 rounded-xl items-center shadow-md active:opacity-90"
                            onPress={handlePurchase}
                        >
                            <Text className="text-brand-navy text-xl font-bold">Record Purchase</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            ) : (
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    className="flex-1 z-10"
                    keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
                >
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ padding: 24, paddingBottom: 150 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className="bg-white p-6 rounded-2xl shadow-sm">
                            <Dropdown
                                label="Select Grain"
                                value={selectedGrain?.name}
                                placeholder="Choose Grain..."
                                onPress={() => setIsGrainModalOpen(true)}
                            />

                            <Dropdown
                                label="Supplier (Person)"
                                value={selectedContact?.name}
                                placeholder="Choose Supplier..."
                                onPress={() => setIsContactModalOpen(true)}
                            />

                            <Dropdown
                                label="Storage Location"
                                value={selectedWarehouse?.name}
                                placeholder="Choose Warehouse..."
                                onPress={() => setIsWarehouseModalOpen(true)}
                            />

                            <View className="flex-row justify-between mb-4">
                                <View className="w-[48%]">
                                    <Text className="text-brand-navy font-bold mb-2 ml-1">No. of Bags</Text>
                                    <TextInput
                                        className={`bg-gray-50 p-4 rounded-xl text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                        keyboardType="numeric"
                                        placeholder="0"
                                        value={numBags}
                                        onChangeText={setNumBags}
                                    />
                                </View>
                                <View className="w-[48%]">
                                    <Text className="text-brand-navy font-bold mb-2 ml-1">Bharti (kg/bag)</Text>
                                    <TextInput
                                        className={`bg-gray-50 p-4 rounded-xl text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                        keyboardType="numeric"
                                        placeholder="60"
                                        value={bharti}
                                        onChangeText={setBharti}
                                    />
                                </View>
                            </View>

                            <Text className="text-brand-navy font-bold mb-2 ml-1">Rate (₹/Quintal)</Text>
                            <TextInput
                                className={`bg-gray-50 p-4 rounded-xl mb-6 text-xl border border-gray-200 focus:border-brand-gold ${Platform.OS === 'web' ? 'outline-none' : ''}`}
                                keyboardType="numeric"
                                placeholder="0.00"
                                value={rate}
                                onChangeText={setRate}
                            />

                            <View className="bg-brand-navy p-5 rounded-xl mb-6 shadow-lg">
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-gray-300">Total Weight</Text>
                                    <View className="items-end">
                                        <Text className="text-white font-bold text-lg">{totalWeightKg} kg</Text>
                                        <Text className="text-gray-400 text-xs">({totalWeightQtl} Quintal)</Text>
                                    </View>
                                </View>
                                <View className="h-[1px] bg-gray-600 my-2" />
                                <View className="flex-row justify-between items-center">
                                    <Text className="text-gray-300">Total Amount</Text>
                                    <Text className="text-white font-bold text-2xl text-brand-gold">₹ {totalPrice}</Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                className="bg-brand-gold p-4 rounded-xl items-center shadow-md active:opacity-90"
                                onPress={handlePurchase}
                            >
                                <Text className="text-brand-navy text-xl font-bold">Record Purchase</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* --- MODALS --- */}

            {/* Grain Modal */}
            <Modal visible={isGrainModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[60%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-2xl font-bold text-brand-navy">Select Grain</Text>
                            {!isNewGrainMode && (
                                <TouchableOpacity onPress={() => setIsNewGrainMode(true)} className="bg-brand-gold px-4 py-2 rounded-lg">
                                    <Text className="text-brand-navy font-bold">+ New</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isNewGrainMode ? (
                            <View>
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Grain Name (e.g. Wheat)"
                                    value={newGrainName}
                                    onChangeText={setNewGrainName}
                                />
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Hindi Name (e.g. Gehu)"
                                    value={newGrainHindi}
                                    onChangeText={setNewGrainHindi}
                                />
                                <TouchableOpacity onPress={handleCreateGrain} className="bg-brand-navy p-4 rounded-xl items-center mb-2">
                                    <Text className="text-white font-bold">Save Grain</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsNewGrainMode(false)} className="p-4 items-center">
                                    <Text className="text-gray-500">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <FlatList
                                    data={grains}
                                    keyExtractor={item => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity className="p-4 border-b border-gray-100" onPress={() => { setSelectedGrain(item); setIsGrainModalOpen(false); }}>
                                            <Text className="text-lg text-brand-navy">{item.name} <Text className="text-gray-400">({item.hindi_name})</Text></Text>
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity onPress={() => setIsGrainModalOpen(false)} className="mt-4 p-4 bg-gray-200 rounded-xl items-center">
                                    <Text className="font-bold">Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Warehouse Modal */}
            <Modal visible={isWarehouseModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[60%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-2xl font-bold text-brand-navy">Select Warehouse</Text>
                            {!isNewWarehouseMode && (
                                <TouchableOpacity onPress={() => setIsNewWarehouseMode(true)} className="bg-brand-gold px-4 py-2 rounded-lg">
                                    <Text className="text-brand-navy font-bold">+ New</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isNewWarehouseMode ? (
                            <View>
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Warehouse Name"
                                    value={newWarehouseName}
                                    onChangeText={setNewWarehouseName}
                                />
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Location (Optional)"
                                    value={newWarehouseLoc}
                                    onChangeText={setNewWarehouseLoc}
                                />
                                <TouchableOpacity onPress={handleCreateWarehouse} className="bg-brand-navy p-4 rounded-xl items-center mb-2">
                                    <Text className="text-white font-bold">Save Warehouse</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsNewWarehouseMode(false)} className="p-4 items-center">
                                    <Text className="text-gray-500">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <FlatList
                                    data={warehouses}
                                    keyExtractor={item => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity className="p-4 border-b border-gray-100" onPress={() => { setSelectedWarehouse(item); setIsWarehouseModalOpen(false); }}>
                                            <Text className="text-lg text-brand-navy">{item.name}</Text>
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity onPress={() => setIsWarehouseModalOpen(false)} className="mt-4 p-4 bg-gray-200 rounded-xl items-center">
                                    <Text className="font-bold">Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Contact Modal */}
            <Modal visible={isContactModalOpen} transparent animationType="slide">
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6 h-[60%]">
                        <View className="flex-row justify-between items-center mb-4">
                            <Text className="text-2xl font-bold text-brand-navy">Select Supplier</Text>
                            {!isNewContactMode && (
                                <TouchableOpacity onPress={() => setIsNewContactMode(true)} className="bg-brand-gold px-4 py-2 rounded-lg">
                                    <Text className="text-brand-navy font-bold">+ New</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isNewContactMode ? (
                            <View>
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4"
                                    placeholder="Enter Name"
                                    value={newContactName}
                                    onChangeText={setNewContactName}
                                />
                                <TouchableOpacity onPress={handleCreateContact} className="bg-brand-navy p-4 rounded-xl items-center mb-2">
                                    <Text className="text-white font-bold">Save Supplier</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setIsNewContactMode(false)} className="p-4 items-center">
                                    <Text className="text-gray-500">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <FlatList
                                    data={contacts}
                                    keyExtractor={item => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity className="p-4 border-b border-gray-100" onPress={() => { setSelectedContact(item); setIsContactModalOpen(false); }}>
                                            <Text className="text-lg text-brand-navy">{item.name}</Text>
                                        </TouchableOpacity>
                                    )}
                                />
                                <TouchableOpacity onPress={() => setIsContactModalOpen(false)} className="mt-4 p-4 bg-gray-200 rounded-xl items-center">
                                    <Text className="font-bold">Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

        </View>
    );
};

export default PurchaseScreen;
