export interface User {
    id: number;
    username: string;
    email: string;
    role: 'admin' | 'counter' | 'viewer';
    created_at: Date;
}

export interface UserRegistration {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'counter' | 'viewer';
}

export interface UserLogin {
    username: string;
    password: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface Giver {
    id: number;
    name: string;
    title: 'pastor' | 'member' | 'visitor';
    phone_number?: string;
    email?: string;
    address?: string;
    notes?: string;
    profile_picture?: string;
    created_at: Date;
    created_by: number;
}

export interface Offering {
    id: number;
    giver_id: number;
    amount: number;
    date: Date;
    method: 'cash' | 'check' | 'zelle' | 'other';
    category: string;
    check_number?: string;
    notes?: string;
    created_at: Date;
    created_by: number;

}