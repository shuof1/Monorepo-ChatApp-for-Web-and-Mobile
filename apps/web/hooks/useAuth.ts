'use client';

import { useAuthContext } from "../components/auth/AuthProvider";

export const useAuth=()=>useAuthContext();