'use client'

import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, useContext, useEffect,useState,ReactNode } from "react";
import { getFirebaseAuth } from "../../lib/firebase";

type AuthContextValue = {
    user: User | null;
    initializing : boolean;
};

const AuthContext= createContext<AuthContextValue>({user:null, initializing:true});

export function AuthProvider({children}:{children: ReactNode}){
    const [user, setUser] = useState<User|null>(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(()=>{
        const firebaseAuth=getFirebaseAuth();
        if (!firebaseAuth) return; // SSR 渲染阶段，auth 为 undefined，直接跳过
        const unsub = onAuthStateChanged(firebaseAuth,(u)=>{
            setUser(u);
            setInitializing(false);
        })
        return () => unsub();
    },[]);

    return <AuthContext.Provider value={{user,initializing}}>{children}</AuthContext.Provider>
}

export function useAuthContext(){
    return useContext(AuthContext);
}