import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const LoginScreen = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert("Error", "Please enter both username and password");
            return;
        }

        setLoading(true);
        try {
            await login(username, password);
        } catch (e) {
            Alert.alert("Login Failed", "Invalid username or password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-brand-navy">
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 justify-center items-center px-8"
            >
                <View className="items-center mb-10">
                    {/* Placeholder Logo */}
                    <View className="w-24 h-24 bg-brand-gold rounded-full justify-center items-center mb-4 shadow-lg">
                        <Text className="text-4xl">🌾</Text>
                    </View>
                    <Text className="text-white text-3xl font-bold">Grain Manager</Text>
                    <Text className="text-gray-300 text-base mt-2">Secure Access Portal</Text>
                </View>

                <View className="w-full bg-white/10 p-6 rounded-2xl border border-white/20 backdrop-blur-md">
                    <Text className="text-white font-bold mb-2 ml-1">Username</Text>
                    <TextInput
                        className="bg-white rounded-xl p-4 text-brand-navy font-bold text-lg mb-4"
                        placeholder="Enter Username"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="none"
                        value={username}
                        onChangeText={setUsername}
                    />

                    <Text className="text-white font-bold mb-2 ml-1">Password</Text>
                    <TextInput
                        className="bg-white rounded-xl p-4 text-brand-navy font-bold text-lg mb-8"
                        placeholder="Enter Password"
                        placeholderTextColor="#9ca3af"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                    />

                    <TouchableOpacity
                        onPress={handleLogin}
                        disabled={loading}
                        className={`bg-brand-gold p-4 rounded-xl items-center shadow-lg ${loading ? 'opacity-70' : ''}`}
                    >
                        {loading ? (
                            <ActivityIndicator color="#1e1b4b" />
                        ) : (
                            <Text className="text-brand-navy font-bold text-xl">LOGIN</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <Text className="text-gray-500 text-xs mt-8">Nagariya Traders • v1.0.0</Text>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default LoginScreen;
