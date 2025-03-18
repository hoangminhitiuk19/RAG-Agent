// Central configuration file

// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'https://regenx-api-24jfqechxq-as.a.run.app';

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kgbfhcjzsujcrmjjavdm.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-default-supabase-anon-key';

// Application Version
export const APP_VERSION = '1.0.0';

// Default User ID if not authenticated
export const DEFAULT_USER_ID = 'e6a10f89-322f-4fcc-9fbd-c6587907f439';

// Default Farm ID
export const DEFAULT_FARM_ID = 'bbc3bcea-fe45-44de-a37a-2d1a524c5ac0';