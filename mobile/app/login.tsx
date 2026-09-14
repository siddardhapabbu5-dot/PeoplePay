import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { login } from "../src/services/api";

export default function LoginScreen() {
  const [id, setId] = useState("EMP002");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await login(id.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>PeoplePay</Text>
      <Text style={styles.title}>Staff attendance</Text>
      <Text style={styles.hint}>Punch in from home. Punch out from site.</Text>
      <TextInput style={styles.input} value={id} onChangeText={setId} autoCapitalize="none" placeholder="Employee ID / Email" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.btn} onPress={submit} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Signing in…" : "LOGIN"}</Text>
      </Pressable>
      <Text style={styles.forgot}>Forgot Password — contact HR</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#f3f4f6", padding: 24, justifyContent: "center" },
  brand: { color: "#1e3a8a", fontSize: 18, fontWeight: "700" },
  title: { fontSize: 28, fontWeight: "700", marginTop: 8 },
  hint: { color: "#6b7280", marginBottom: 24, marginTop: 6 },
  input: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  btn: { backgroundColor: "#1e3a8a", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontWeight: "700" },
  error: { color: "#dc2626", marginBottom: 8 },
  forgot: { textAlign: "center", color: "#6b7280", marginTop: 16 },
});
