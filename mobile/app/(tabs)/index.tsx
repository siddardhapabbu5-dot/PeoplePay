import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { api } from "../../src/services/api";

export default function HomeScreen() {
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const load = useCallback(() => api("/api/attendance/today").then(setData).catch(() => setData(null)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const today = data?.today;
  const status = today?.dayStatus ?? "NOT_PUNCHED_IN";
  const punchedIn = status === "WORKING" || status === "ON_BREAK";
  const done = status === "PUNCHED_OUT";

  return (
    <ScrollView style={styles.page} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.h1}>PeoplePay Attendance</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{data?.employee?.name ?? "…"}</Text>
        <Text style={styles.meta}>{data?.employee?.code} · {data?.employee?.designation}</Text>
        <Text style={styles.meta}>{data?.employee?.department}</Text>
        <Text style={styles.clock}>{now.toLocaleDateString("en-IN")} · {now.toLocaleTimeString("en-IN")}</Text>
        <Text style={styles.shift}>Shift {data?.shift?.startTime ?? "09:00"} – {data?.shift?.endTime ?? "18:00"}</Text>
        <View style={[styles.badge, { backgroundColor: color(status) }]}>
          <Text style={styles.badgeText}>{status.replaceAll("_", " ")}</Text>
        </View>
      </View>
      {today?.punchIn ? (
        <View style={styles.card}>
          <Row label="Punch In" value={today.punchIn} />
          <Row label="Working" value={mins(today.workingMinutes)} />
          <Row label="Break" value={mins(today.breakMinutes)} />
          <Row label="Overtime" value={mins(today.overtimeMin)} />
        </View>
      ) : null}
      {!done && (
        <Pressable
          style={[styles.action, { backgroundColor: punchedIn ? "#ea580c" : "#059669" }]}
          onPress={() => router.push({ pathname: "/punch", params: { type: punchedIn ? "OUT" : "IN" } })}
        >
          <Text style={styles.actionText}>{punchedIn ? "PUNCH OUT" : "PUNCH IN"}</Text>
        </Pressable>
      )}
      {punchedIn && (
        <Pressable style={styles.ghost} onPress={() => router.push({ pathname: "/punch", params: { type: status === "ON_BREAK" ? "END_BREAK" : "BREAK" } })}>
          <Text style={styles.ghostText}>{status === "ON_BREAK" ? "END BREAK" : "START BREAK"}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}
function mins(n?: number) {
  const m = n ?? 0;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function color(s: string) {
  if (s === "WORKING") return "#059669";
  if (s === "PUNCHED_OUT") return "#1e3a8a";
  if (s === "ON_BREAK") return "#ea580c";
  return "#6b7280";
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6", padding: 16, paddingTop: 56 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#111827" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, marginBottom: 12 },
  name: { fontSize: 20, fontWeight: "700" },
  meta: { color: "#6b7280", marginTop: 2 },
  clock: { marginTop: 10, fontWeight: "600" },
  shift: { color: "#1e3a8a", marginTop: 4 },
  badge: { alignSelf: "flex-start", marginTop: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  strong: { fontWeight: "700" },
  action: { borderRadius: 18, padding: 18, alignItems: "center", marginTop: 8 },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  ghost: { borderRadius: 18, padding: 14, alignItems: "center", marginTop: 10, backgroundColor: "#fff" },
  ghostText: { color: "#1e3a8a", fontWeight: "700" },
});
