import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, clearToken } from "../../src/services/api";

export default function ProfileScreen() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/employee/profile").then(setData).catch(() => setData(null)); }, []);
  return (
    <ScrollView style={styles.page}>
      <Text style={styles.h1}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{data?.employee?.name}</Text>
        <Text>{data?.employee?.code}</Text>
        <Text>{data?.employee?.designation} · {data?.employee?.department}</Text>
        <Text>{data?.employee?.phone}</Text>
        <Text>{data?.employee?.email}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.name}>Home location</Text>
        <Text>{data?.home?.address ?? "Not set"}</Text>
        <Text>Radius {data?.home?.allowedRadius ?? "—"}m</Text>
        <Text style={styles.lock}>You cannot change approved locations.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.name}>Assigned sites</Text>
        {data?.sites?.map((s: any) => <Text key={s.id}>{s.siteName}</Text>)}
      </View>
      <Pressable style={styles.out} onPress={async () => { await clearToken(); router.replace("/login"); }}>
        <Text style={styles.outText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6", padding: 16, paddingTop: 56 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 8 },
  name: { fontWeight: "700", marginBottom: 4 },
  lock: { color: "#6b7280", marginTop: 8, fontSize: 12 },
  out: { marginTop: 16, backgroundColor: "#fff", padding: 14, borderRadius: 14, alignItems: "center" },
  outText: { color: "#dc2626", fontWeight: "700" },
});
