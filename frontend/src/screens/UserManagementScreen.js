import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Switch } from 'react-native';
import client from '../api/client';
import { useNavigation } from '@react-navigation/native';

const UserManagementScreen = () => {
    const navigation = useNavigation();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);

    // Form State
    const [editingUser, setEditingUser] = useState(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('worker');
    const [permissions, setPermissions] = useState(['purchase', 'sale']); // Default worker perms

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await client.get('/users/');
            setUsers(res.data);
        } catch (e) {
            Alert.alert("Error", "Failed to fetch users. Access Denied?");
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!username && !editingUser) { Alert.alert("Error", "Username required"); return; }
        if (!password && !editingUser) { Alert.alert("Error", "Password required"); return; }

        try {
            const payload = {
                username,
                password: password || undefined, // Send only if changed for edit
                role,
                permissions
            };

            if (editingUser) {
                await client.put(`/users/${editingUser.id}`, payload);
                Alert.alert("Success", "User Updated (Logged out from other devices)");
            } else {
                await client.post('/users/', payload);
                Alert.alert("Success", "User Created");
            }
            setModalVisible(false);
            fetchUsers();
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Operation Failed");
        }
    };

    const openEdit = (user) => {
        setEditingUser(user);
        setUsername(user.username);
        setPassword('');
        setRole(user.role);
        setPermissions(user.permissions || []);
        setModalVisible(true);
    };

    const openCreate = () => {
        setEditingUser(null);
        setUsername('');
        setPassword('');
        setRole('worker');
        setPermissions(['purchase', 'sale']);
        setModalVisible(true);
    };

    const togglePermission = (perm) => {
        if (permissions.includes(perm)) {
            setPermissions(permissions.filter(p => p !== perm));
        } else {
            setPermissions([...permissions, perm]);
        }
    };

    return (
        <View className="flex-1 bg-brand-light">
            <View className="bg-brand-navy pt-12 pb-6 px-6 shadow-lg z-20 mb-4 flex-row justify-between items-center">
                <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
                        <Text className="text-white text-2xl">←</Text>
                    </TouchableOpacity>
                    <Text className="text-2xl font-bold text-white">User Management</Text>
                </View>
                <TouchableOpacity onPress={openCreate} className="bg-brand-gold px-3 py-2 rounded-lg">
                    <Text className="font-bold text-brand-navy">+ Add User</Text>
                </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator size="large" className="mt-10" /> : (
                <FlatList
                    data={users}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => (
                        <View className="bg-white p-4 rounded-xl mb-3 shadow-sm flex-row justify-between items-center">
                            <View>
                                <Text className="font-bold text-lg text-brand-navy">{item.username}</Text>
                                <Text className="text-gray-500 text-xs uppercase font-bold">{item.role}</Text>
                                <Text className="text-gray-400 text-xs">Perms: {item.permissions?.join(', ')}</Text>
                            </View>
                            <TouchableOpacity onPress={() => openEdit(item)} className="bg-gray-100 p-2 rounded-lg">
                                <Text className="text-brand-navy font-bold">Edit / Reset</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                />
            )}

            <Modal visible={isModalVisible} transparent animationType="slide">
                <View className="flex-1 justify-center items-center bg-black/50 px-4">
                    <View className="bg-white w-full rounded-xl p-6">
                        <Text className="text-xl font-bold mb-4">{editingUser ? 'Edit User' : 'Create User'}</Text>

                        {!editingUser && (
                            <>
                                <Text className="mb-1 text-gray-600">Username</Text>
                                <TextInput className="border border-gray-200 p-3 rounded-lg mb-4 bg-gray-50" value={username} onChangeText={setUsername} autoCapitalize="none" />
                            </>
                        )}

                        <Text className="mb-1 text-gray-600">Password {editingUser && '(Leave blank to keep same)'}</Text>
                        <TextInput className="border border-gray-200 p-3 rounded-lg mb-4 bg-gray-50" value={password} onChangeText={setPassword} secureTextEntry placeholder="******" />

                        <Text className="mb-1 text-gray-600">Role</Text>
                        <View className="flex-row mb-4">
                            {['worker', 'admin'].map(r => (
                                <TouchableOpacity key={r} onPress={() => setRole(r)} className={`mr-2 px-3 py-2 rounded border ${role === r ? 'bg-brand-navy border-brand-navy' : 'bg-white'}`}>
                                    <Text className={role === r ? 'text-white' : 'text-gray-600'}>{r.toUpperCase()}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text className="mb-1 text-gray-600">Permissions</Text>
                        <View className="flex-row flex-wrap mb-6">
                            {['purchase', 'sale', 'inventory', 'reports'].map(p => (
                                <TouchableOpacity
                                    key={p}
                                    onPress={() => togglePermission(p)}
                                    className={`mr-2 mb-2 px-3 py-1 rounded-full border ${permissions.includes(p) ? 'bg-brand-gold border-brand-gold' : 'border-gray-300'}`}
                                >
                                    <Text className={permissions.includes(p) ? 'text-brand-navy font-bold' : 'text-gray-500'}>{p}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View className="flex-row justify-end space-x-2">
                            <TouchableOpacity onPress={() => setModalVisible(false)} className="p-3">
                                <Text className="text-gray-500">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} className="bg-brand-navy p-3 rounded-lg">
                                <Text className="text-white font-bold">Save User</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default UserManagementScreen;
