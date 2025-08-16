'use client';
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";

export default function Home(){
  const { user, initializing } = useAuth();
  const router=useRouter();
  useEffect(()=>{
    if(initializing) return;
    router.replace(user ? '/dashboard' : '/login');
  },[initializing,user,router]);

  return <div style={{ padding: 16 }}>Loading...</div>
}