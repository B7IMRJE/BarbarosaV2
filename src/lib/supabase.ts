import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

export const supabaseUrl = 'https://rkdjbztxkjflchktggaj.supabase.co';

export const supabaseAnonKey =
    'sb_publishable_srvdagAVHGi0NsJviVU53w_NMulNPQW';

const memoryStorage = {
    getItem: async (_key: string) => null,
    setItem: async (_key: string, _value: string) => { },
    removeItem: async (_key: string) => { },
};

const webStorage = {
    getItem: async (key: string) => {
        if (typeof window === 'undefined') return null;
        return window.localStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
        if (typeof window === 'undefined') return;
        window.localStorage.removeItem(key);
    },
};

const storage = Platform.OS === 'web' ? webStorage : memoryStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
    },
    global: {
        headers: {
            'X-Client-Info': 'homeos-expo',
        },
    },
});
