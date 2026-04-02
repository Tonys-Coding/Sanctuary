import axios from 'axios';
import type { AuthResponse, 
              LoginCredentials, 
              RegisterData, 
              Giver, 
              CreateGiverData, 
              UpdateGiverData,
              Offering,
              CreateOfferingData,
              UpdateOfferingData,
              OfferingStats,
              DashboardStats
            } from './types';

const API_URL = 'http://localhost:5001/api';

//Creating axios instance with deafult configuration
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

//Add token to requests if available
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

//Auth API calls
export const authAPI = {
    register: async (data: RegisterData): Promise<AuthResponse> => {
        const response = await api.post('/auth/register', data);
        return response.data;
    },

    login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
        const response = await api.post('/auth/login', credentials);
        return response.data;
    },
};

//Givers API calls
export const giversAPI = {
    getAll: async (): Promise<Giver[]> => {
        const response = await api.get('/givers');
        return response.data;
    },

    getById: async (id: number): Promise<Giver> => {
        const response = await api.get(`/givers/${id}`);
        return response.data;
    },
    create: async (data: CreateGiverData): Promise<Giver> => {
        const response = await api.post('/givers/${id}', data);
        return response.data;
    },
    update: async (id: number, data: UpdateGiverData): Promise<Giver> => {
        const response = await api.put(`/givers/${id}`, data);
        return response.data;
    },
    delete: async (id: number): Promise<void> => {
        await api.delete(`/givers/${id}`);
    },

    uploadedProfilePicture: async (id: number, file: File): Promise<Giver> => {
        const formData = new FormData();
        formData.append('profile_picture', file);
        const response = await api.post(`/givers/${id}/profile-picture`, formData)
        return response.data;
    },
    deleteProfilePicture: async (id: number): Promise<Giver> => {
        const response = await api.delete(`/givers/${id}/profile-picture`);
        return response.data;
    },
};

export const offeringsAPI = {
    getAll: async (params?: {
        giver_id?: number;
        method?: string;
        start_date?: string;
        end_date?: string;
    }): Promise<Offering[]> => {
        const response = await api.get(`offerings`, { params });
        return response.data;
    },

    getById: async (id: number): Promise<Offering> => {
        const response = await api.get(`offerings/${id}`);
        return response.data;
    },

    getByGiver: async (giver_id: number): Promise<Offering[]> => {
        const response = await api.get(`/offerings/giver/${giver_id}`);
        return response.data
    },

    create: async (data: CreateOfferingData): Promise<Offering> => {
        const response = await api.post(`/offerings`, data);
        return response.data;
    },

    update: async (id: number, data: UpdateOfferingData): Promise<Offering> => {
        const response = await api.put(`/offerings/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/offerings/${id}`);
    },

    getStats: async (params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<OfferingStats> => {
        const response = await api.get(`/offerings/stats`, { params });
        return response.data
    },
};

export const dashboardAPI = {
    getStats: async (): Promise<DashboardStats> => {
        const response = await api.get('/dashboard/stats');
        return response.data;
    },
};


export default api;