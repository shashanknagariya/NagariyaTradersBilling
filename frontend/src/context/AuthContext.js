import React, { createContext, useState, useContext } from 'react';
import client from '../api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const login = async (username, password) => {
        setIsLoading(true);
        try {
            const res = await client.post('/auth/login', `username=${username}&password=${password}`, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token, user } = res.data;
            setUserToken(access_token);
            setUserInfo(user);

            // Set default header for future requests
            client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

        } catch (e) {
            console.error(e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        setUserToken(null);
        setUserInfo(null);
        delete client.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ login, logout, userToken, userInfo, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
