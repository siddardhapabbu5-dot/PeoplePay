import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/services/api";

export default function LeaveScreen() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/api/leaves/balances").then(setRows).catch(() => setRows([])); }, []);
  return (
    <ScrollView style={styles.page}>
      <Text style={styles.h1}>Leave</Text>
      {rows.map((b) => (
        <View key={b.id} style={styles.card}>
          <Text style={styles.name}>{b.leaveType?.name}</Text>
          <Text>{Number(b.entitled) - Number(b.used)} left · used {Number(b.used)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6", padding: 16, paddingTop: 56 },
  h1: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 8 },
  name: { fontWeight: "700" },
});
