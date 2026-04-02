import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
    children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    return (
        <div className="min-h-screen bg-celestial flex">
        { /* Sidebar */}
        <Sidebar />

        {/* Main Content*/}

        <div className="flex-1 overflow-auto">
            {children}
        </div>
    </div>
    );
};

export default Layout;