-- Users table (for login)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'counter' CHECK (role IN ('admin', 'counter', 'viewer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Givers table (people who give offerings)
CREATE TABLE IF NOT EXISTS givers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    title VARCHAR(20) NOT NULL CHECK (title IN ('pastor', 'member', 'visitor')),
    phone_number VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    notes TEXT,
    profile_picture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Offerings table (individual offering records)
CREATE TABLE IF NOT EXISTS offerings (
    id SERIAL PRIMARY KEY,
    giver_id INTEGER REFERENCES givers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    date DATE NOT NULL,
    method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'check', 'card', 'transfer', 'other')),
    category VARCHAR(50) DEFAULT 'general',
    check_number VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Church totals table (overall service totals)
CREATE TABLE IF NOT EXISTS church_totals (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    service_type VARCHAR(50),
    attendance INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Audit log table (track who did what)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_offerings_giver_id ON offerings(giver_id);
CREATE INDEX IF NOT EXISTS idx_offerings_date ON offerings(date);
CREATE INDEX IF NOT EXISTS idx_givers_title ON givers(title);
CREATE INDEX IF NOT EXISTS idx_church_totals_date ON church_totals(date);