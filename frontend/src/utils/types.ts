export interface User {
    id: number;
    username: string;
    email: string;
    role: 'admin' | 'counter' | 'viewer';
    created_at: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface RegisterData {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'counter' | 'viewer';
}

export interface Giver {
    id: number;
    name: string;
    title: 'pastor' | 'member' | 'visitor';
    phone_number?: string;
    email?: string;
    address?: string;
    notes?: string;
    profile_picture?: string | null;
    created_at: string;
    created_by: number;
}

export interface CreateGiverData {
    name: string;
    title: 'pastor' | 'member' | 'visitor';
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    profile_picture?: string;
}

export interface UpdateGiverData extends CreateGiverData {
    id: number;
}

export interface Offering {
    id: number;
    giver_id: number;
    amount: number;
    date: string;
    method: 'cash' | 'check' | 'card' | 'transfer' | 'other';
    category: string;
    check_number?:string;
    notes?:string;
    created_at: string;
    created_by: number;
}

export interface CreateOfferingData {
    giver_id: number;
    amount: number;
    date: string;
    method: 'cash' | 'check' | 'card' | 'transfer' | 'other';
    category?: string;
    check_number?:string;
    notes?:string;
}

export interface UpdateOfferingData extends CreateOfferingData {
    id: number;
}

export interface OfferingStats {
    overall: {
        total_offerings: number;
        total_amount: number;
    };
    by_method: Array<{
        method:string;
        total_count: string;
        total_amount: string;
        average_amount: string;
        method_count: string;
    }>;

}

export interface DashboardStats {
summary: {
    total_givers: number;
    total_offerings_count: number;
    total_offerings_amount: number;
    this_month_amount: number;
    this_month_count: number;
    recent_count: number;
    recent_amount: number;
};

offerings_by_method: Array<{
    method: string;
    count: number;
    total: number;
}>;
top_givers: Array<{
    id: number;
    name: string;
    offering_count: number;
    toatl_amount: number;
}>;
offerings_over_time: Array<{
    month: string;
    count: number;
    total: number;
}>;
recent_activity: Array<{
    id: number;
    amount: number;
    date: string;
    method: string;
    giver_name: string;
    created_at: string;
}>;
}




