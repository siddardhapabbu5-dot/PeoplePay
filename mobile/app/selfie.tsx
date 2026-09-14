import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { API_URL } from "../src/config";
import { api, getToken } from "../src/services/api";

export default function SelfieScreen() {
  const params = useLocalSearchParams<{ type: string; lat: string; lng: string; acc?: string; mock?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Camera permission is required for attendance.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}><Text style={styles.btnText}>Allow camera</Text></Pressable>
      </View>
    );
  }

  async function snap() {
    const photo = await cam.current?.takePictureAsync({ quality: 0.6 });
    if (photo?.uri) setPreview(photo.uri);
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("selfie", { uri: preview, name: "selfie.jpg", type: "image/jpeg" } as any);
      const up = await fetch(`${API_URL}/api/attendance/selfie`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const uploaded = await up.json();
      if (!up.ok) throw new Error(uploaded.error || "Selfie upload failed");
      const path = params.type === "OUT" ? "/api/attendance/punch-out" : "/api/attendance/punch-in";
      const result = await api(path, {
        method: "POST",
        body: JSON.stringify({
          latitude: Number(params.lat),
          longitude: Number(params.lng),
          gpsAccuracy: params.acc ? Number(params.acc) : undefined,
          selfiePath: uploaded.selfiePath,
          mockGps: params.mock === "1",
        }),
      });
      setMsg(result.message || "Success");
      setTimeout(() => router.replace("/(tabs)"), 1200);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Punch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Live selfie</Text>
      {preview ? (
        <>
          <Image source={{ uri: preview }} style={styles.preview} />
          <View style={styles.row}>
            <Pressable style={styles.ghost} onPress={() => setPreview(null)}><Text>Retake</Text></Pressable>
            <Pressable style={styles.btn} onPress={confirm} disabled={busy}><Text style={styles.btnText}>{busy ? "Saving…" : "Confirm"}</Text></Pressable>
          </View>
        </>
      ) : (
        <>
          <CameraView ref={cam} style={styles.cam} facing="front" />
          <Pressable style={styles.btn} onPress={snap}><Text style={styles.btnText}>Capture selfie</Text></Pressable>
        </>
      )}
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#111827", paddingTop: 56, paddingHorizontal: 16 },
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  cam: { height: 380, borderRadius: 24, overflow: "hidden" },
  preview: { height: 380, borderRadius: 180, width: 280, alignSelf: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 12 },
  btn: { backgroundColor: "#059669", borderRadius: 16, padding: 16, alignItems: "center", flex: 1, marginTop: 16 },
  btnText: { color: "#fff", fontWeight: "800" },
  ghost: { backgroundColor: "#fff", borderRadius: 16, padding: 16, flex: 1, alignItems: "center", marginTop: 16 },
  msg: { color: "#fbbf24", marginTop: 16, textAlign: "center" },
  error: { color: "#dc2626", marginBottom: 12, fontWeight: "600" },
});
