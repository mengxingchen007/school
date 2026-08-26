"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// 一个小工具：随时知道"现在有没有人登录、登录的是谁、是不是管理员"
export function useUser() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data?.session?.user ?? null;
      if (!active) return;
      setUser(sessionUser);
      if (sessionUser) {
        await loadProfile(sessionUser.id);
      }
      setLoading(false);
    }

    async function loadProfile(userId) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (active) setProfile(data ?? null);
    }

    loadInitial();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        loadProfile(sessionUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { user, profile, loading, isAdmin: !!profile?.is_admin };
}
