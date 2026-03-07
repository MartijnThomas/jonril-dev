export type User = {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user' | string;
    avatar?: string;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    created_at: string;
    updated_at: string;
    settings?: {
        language?: 'nl' | 'en' | string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

export type Auth = {
    user: User;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
