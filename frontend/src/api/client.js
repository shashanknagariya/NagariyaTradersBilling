import axios from 'axios';
import { Platform } from 'react-native';

// Android Emulator: 10.0.2.2
// Web/iOS Simulator: localhost
const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default client;
