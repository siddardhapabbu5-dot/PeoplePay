import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/services/api";

export default function AttendanceHistory() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const now = new Date();
    api(`/api/attendance/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).then(setData);
  }, []);
  return (
    <ScrollView style={styles.page}>
      <Text style={styles.h1}>My Attendance</Text>
      {data?.rows?.map((r: any) => (
        <View key={r.id} style={styles.row}>
          <Text>{r.date?.slice(0, 10)}</Text>
          <Text>{r.punchIn ?? "—"} → {r.punchOut ?? "—"}</Text>
          <Text style={styles.status}>{r.status}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6", padding: 16, paddingTop: 56 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  row: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 8 },
  status: { color: "#1e3a8a", fontWeight: "700", marginTop: 4 },
});
