import axios from 'axios';
import { Platform } from 'react-native';

// Production URL (Render)
const PROD_URL = 'https://nagariyatradersbilling.onrender.com';

// Local Dev URL
const LOCAL_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

// Automatically switch based on environment
const API_URL = __DEV__ ? LOCAL_URL : PROD_URL;
// const API_URL = PROD_URL; // Uncomment to force Prod URL for testing locally

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export default client;
