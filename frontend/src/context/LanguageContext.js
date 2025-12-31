import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../translations';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    // Default to Hindi if prefered, or English
    const [language, setLanguage] = useState('en');

    useEffect(() => {
        loadLanguage();
    }, []);

    const loadLanguage = async () => {
        try {
            const saved = await AsyncStorage.getItem('appLanguage');
            if (saved) setLanguage(saved);
        } catch (e) {
            console.error("Failed to load language", e);
        }
    };

    const switchLanguage = async (lang) => {
        try {
            setLanguage(lang);
            await AsyncStorage.setItem('appLanguage', lang);
        } catch (e) {
            console.error("Failed to save language", e);
        }
    };

    // Translator function
    // Usage: t('dashboard') -> returns string
    const t = (key) => {
        const dict = translations[language] || translations['en'];
        return dict[key] || key; // Fallback to key if missing
    };

    return (
        <LanguageContext.Provider value={{ language, switchLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
