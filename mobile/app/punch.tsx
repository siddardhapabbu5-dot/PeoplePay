import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { api } from "../src/services/api";
import { openSettings, requestGps } from "../src/hooks/useGps";

export default function PunchScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const [msg, setMsg] = useState("Checking location…");
  const [geo, setGeo] = useState<any>(null);
  const [blocked, setBlocked] = useState("");

  useEffect(() => { run(); }, [type]);

  async function run() {
    if (type === "BREAK") {
      try { await api("/api/attendance/break-start", { method: "POST", body: "{}" }); router.replace("/(tabs)"); }
      catch (e) { setBlocked(e instanceof Error ? e.message : "Failed"); }
      return;
    }
    if (type === "END_BREAK") {
      try { await api("/api/attendance/break-end", { method: "POST", body: "{}" }); router.replace("/(tabs)"); }
      catch (e) { setBlocked(e instanceof Error ? e.message : "Failed"); }
      return;
    }
    const gps = await requestGps();
    if (!gps.ok) {
      setBlocked(gps.error);
      return;
    }
    try {
      const check = await api(`/api/attendance/validate-location?type=${type}`, {
        method: "POST",
        body: JSON.stringify({ latitude: gps.latitude, longitude: gps.longitude, gpsAccuracy: gps.gpsAccuracy }),
      });
      setGeo({ gps, check });
      setMsg(`${check.status} · ${check.distance}m / ${check.allowedRadius}m`);
      if (!check.verified) {
        setBlocked(type === "IN"
          ? "Punch In is allowed only from your registered home location."
          : "Punch Out is allowed only from your assigned site location.");
      }
    } catch (e) {
      setBlocked(e instanceof Error ? e.message : "Location check failed");
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>{type === "OUT" ? "Punch Out" : "Punch In"}</Text>
      <Text style={styles.sub}>{msg}</Text>
      {geo?.check?.target && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: geo.gps.latitude,
            longitude: geo.gps.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker coordinate={{ latitude: geo.gps.latitude, longitude: geo.gps.longitude }} pinColor="blue" title="You" />
          <Marker coordinate={{ latitude: geo.check.target.latitude, longitude: geo.check.target.longitude }} pinColor="red" title="Approved" />
          <Circle
            center={{ latitude: geo.check.target.latitude, longitude: geo.check.target.longitude }}
            radius={geo.check.allowedRadius}
            strokeColor="#1e3a8a"
            fillColor="rgba(30,58,138,0.15)"
          />
        </MapView>
      )}
      {geo && (
        <View style={styles.card}>
          <Text>Distance: {geo.check.distance} metres</Text>
          <Text>Allowed: {geo.check.allowedRadius} metres</Text>
          <Text>Status: {geo.check.status}</Text>
        </View>
      )}
      {blocked ? (
        <>
          <Text style={styles.error}>{blocked}</Text>
          {blocked.includes("permission") && <Pressable onPress={openSettings}><Text style={styles.link}>OPEN SETTINGS</Text></Pressable>}
        </>
      ) : geo?.check?.verified ? (
        <Pressable style={styles.btn} onPress={() => router.push({ pathname: "/selfie", params: { type, lat: String(geo.gps.latitude), lng: String(geo.gps.longitude), acc: String(geo.gps.gpsAccuracy ?? ""), mock: geo.gps.mockGps ? "1" : "0" } })}>
          <Text style={styles.btnText}>Continue to selfie</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6", paddingTop: 56, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { color: "#6b7280", marginVertical: 8 },
  map: { height: 260, borderRadius: 18, overflow: "hidden" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, marginTop: 12 },
  error: { color: "#dc2626", marginTop: 16, fontWeight: "600" },
  link: { color: "#1e3a8a", marginTop: 8, fontWeight: "700" },
  btn: { backgroundColor: "#059669", marginTop: 16, borderRadius: 16, padding: 16, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
