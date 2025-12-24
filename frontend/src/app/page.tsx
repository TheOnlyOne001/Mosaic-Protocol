'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
    const router = useRouter();
    
    useEffect(() => {
        router.replace('/landing');
    }, [router]);
    
    return <div className="min-h-screen bg-black" />;
}
