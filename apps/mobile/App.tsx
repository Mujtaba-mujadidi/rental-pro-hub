import { APP_NAME } from "@rph/shared";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { supabase } from "./lib/supabase";

export default function App() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) {
        if (!cancelled) setStatus("configure .env (see .env.example)");
        return;
      }
      const { error } = await supabase.auth.getSession();
      if (!cancelled) setStatus(error ? error.message : "Supabase ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.sub}>Phase 0 — mobile</Text>
      <Text style={styles.status}>{status}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  status: {
    fontSize: 13,
    textAlign: "center",
    color: "#333",
  },
});
